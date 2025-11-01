"""WebSocket handlers for real-time communication."""

import json
import logging
from typing import Dict, Any
from datetime import datetime
import asyncio
import contextlib
from app.obs.tracing import tracer, TraceEvent
from app.agents.landing_zone_team import LandingZoneTeam
from fastapi import WebSocket, WebSocketDisconnect
from app.core.azure_client import AzureClientManager
from app.agents.tools.analyze_diagram import analyze_diagram

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections."""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.conversation_connections: Dict[str, list] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept a WebSocket connection."""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected")
    
    def disconnect(self, client_id: str):
        """Remove a WebSocket connection."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected")
    
    async def send_personal_message(self, message: str, client_id: str):
        """Send a message to a specific client."""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_text(message)
    
    async def send_json_message(self, data: dict, client_id: str):
        """Send JSON data to a specific client."""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            await websocket.send_json(data)
    
    def add_to_conversation(self, conversation_id: str, client_id: str):
        """Add client to conversation for broadcasting."""
        if conversation_id not in self.conversation_connections:
            self.conversation_connections[conversation_id] = []
        if client_id not in self.conversation_connections[conversation_id]:
            self.conversation_connections[conversation_id].append(client_id)
    
    async def broadcast_to_conversation(self, conversation_id: str, data: dict):
        """Broadcast message to all clients in a conversation."""
        if conversation_id in self.conversation_connections:
            clients = self.conversation_connections[conversation_id].copy()
            for client_id in clients:
                try:
                    await self.send_json_message(data, client_id)
                except Exception as e:
                    logger.warning(f"Failed to send to client {client_id}: {e}")
                    # Remove disconnected client
                    if client_id in self.conversation_connections[conversation_id]:
                        self.conversation_connections[conversation_id].remove(client_id)


# Global connection manager
manager = ConnectionManager()

# NEW: bridge TraceEvent -> WebSocket messages
async def _forward_trace_events(run_id: str, client_id: str, conversation_id: str | None):
    try:
        async for raw in tracer.stream(run_id):
            payload = json.loads(raw)
            msg = {
                "type": "trace_event",
                "run_id": payload["run_id"],
                "step_id": payload["step_id"],
                "agent": payload["agent"],
                "phase": payload["phase"],
                "ts": payload["ts"],
                "meta": payload.get("meta", {}),
                "progress": payload.get("progress", {}),
                "telemetry": payload.get("telemetry", {}),
                "message_delta": payload.get("message_delta"),
                "summary": payload.get("summary"),
                "error": payload.get("error"),
                "conversation_id": conversation_id,
            }
            # Send to the caller
            await manager.send_json_message(msg, client_id)
            # Optionally also broadcast to others in the same conversation
            if conversation_id:
                await manager.broadcast_to_conversation(conversation_id, msg)
    except asyncio.CancelledError:
        # Task cancelled when run completes; swallow cancellation so loop exits quietly
        pass


async def handle_team_stream_chat(data: dict, client_id: str, azure_clients: AzureClientManager):
    """
    Run the multi-agent 'landing zone team' with tracing and stream progress over WS.
    Expected payload:
      {
        "type": "team_stream_chat",
        "message": "Design a secure Azure landing zone for a fintech startup",
        "conversation_id": "...",
        "parallel": false   # optional: if true, uses fan-out/fan-in pass
      }
    """
    run_id: str | None = None
    forwarder: asyncio.Task | None = None
    try:
        user_prompt = data.get("message", "")
        conversation_id = data.get("conversation_id")
        use_parallel = bool(data.get("parallel", False))
        context_payload = data.get("context") if isinstance(data.get("context"), dict) else None

        context_prefix = ""
        if context_payload:
            summary = context_payload.get("summary")
            if isinstance(summary, str) and summary.strip():
                context_prefix += f"Conversation summary:\n{summary.strip()}\n\n"
            recent_messages = context_payload.get("recent_messages")
            if isinstance(recent_messages, list):
                formatted_recent = []
                for entry in recent_messages[-8:]:
                    if not isinstance(entry, dict):
                        continue
                    role = entry.get("role", "user")
                    content = entry.get("content", "")
                    if isinstance(content, str) and content.strip():
                        formatted_recent.append(f"{role}: {content.strip()}")
                if formatted_recent:
                    context_prefix += "Recent exchanges:\n" + "\n".join(formatted_recent) + "\n\n"

        composed_prompt = user_prompt.strip()
        if context_prefix:
            composed_prompt = f"{context_prefix}Current user request:\n{composed_prompt}".strip()

        if not user_prompt:
            await manager.send_json_message({
                "type": "error",
                "message": "Message is required"
            }, client_id)
            return

        # Build the team (we reuse the same underlying client you already use)
        # Use the same agent_client you pass to AzureArchitectAgent internally:
        architect_agent = azure_clients.get_azure_architect_agent()
        team = LandingZoneTeam(architect_agent.agent_client)

        # Generate a run id up front so we can stream progress immediately
        run_id = tracer.new_run()
        tracer.ensure_run(run_id)

        # Start forwarding trace events to this socket (and to the conversation)
        forwarder = asyncio.create_task(_forward_trace_events(run_id, client_id, conversation_id))

        # Let UI know: run starting with run identifier
        await manager.send_json_message({
            "type": "run_started",
            "conversation_id": conversation_id,
            "run_id": run_id,
        }, client_id)

        if use_parallel:
            final_text, diagram_payload, raw_diagram, iac_bundle, _ = await team.run_parallel_pass_traced(
                composed_prompt, run_id=run_id
            )
        else:
            final_text, diagram_payload, raw_diagram, iac_bundle, _ = await team.run_sequential_traced(
                composed_prompt, run_id=run_id
            )

        if isinstance(diagram_payload, dict):
            services = diagram_payload.get("services") or []
            connections = diagram_payload.get("connections") or []
            groups = diagram_payload.get("groups") or []
            logger.info(
                "LandingZoneTeam diagram summary: services=%d groups=%d connections=%d",
                len(services),
                len(groups),
                len(connections),
            )

        # Send final answer
        await manager.send_json_message({
            "type": "team_final",
            "conversation_id": conversation_id,
            "run_id": run_id,
            "message": final_text,
            "diagram": diagram_payload,
            "diagram_raw": raw_diagram,
            "iac": iac_bundle,
            "timestamp": datetime.utcnow().isoformat()
        }, client_id)

        # Broadcast conversation update
        if conversation_id:
            await manager.broadcast_to_conversation(conversation_id, {
                "type": "conversation_update",
                "conversation_id": conversation_id,
                "user_message": user_prompt,
                "assistant_message": final_text,
                "diagram": diagram_payload,
                "timestamp": datetime.utcnow().isoformat()
            })

        # Signal tracer listeners that the run has completed
        if run_id:
            await tracer.finish(run_id)

        # Mark run complete
        await manager.send_json_message({
            "type": "run_completed",
            "conversation_id": conversation_id,
            "run_id": run_id
        }, client_id)

    except Exception as e:
        logger.error(f"Error in team_stream_chat: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to run agent team: {str(e)}"
        }, client_id)
        if run_id:
            await tracer.finish(run_id)

    finally:
        if forwarder:
            forwarder.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await forwarder

async def handle_subscribe_run(data: dict, client_id: str):
    run_id = data.get("run_id")
    conversation_id = data.get("conversation_id")
    if not run_id:
        await manager.send_json_message({"type": "error", "message": "run_id is required"}, client_id)
        return
    asyncio.create_task(_forward_trace_events(run_id, client_id, conversation_id))
    await manager.send_json_message({"type": "subscribed_run", "run_id": run_id}, client_id)


async def handle_chat_websocket(websocket: WebSocket, client_id: str, azure_clients: AzureClientManager):
    """Handle WebSocket connections for chat."""
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "chat_message":
                await handle_chat_message(data, client_id, azure_clients)
            elif message_type == "join_conversation":
                await handle_join_conversation(data, client_id)
            elif message_type == "stream_chat":
                await handle_stream_chat(data, client_id, azure_clients)
            elif message_type == "analyze_diagram":
                await handle_analyze_diagram(data, client_id, azure_clients)
            elif message_type == "team_stream_chat":
                await handle_team_stream_chat(data, client_id, azure_clients)
            elif message_type == "subscribe_run":
                await handle_subscribe_run(data, client_id)
            else:
                await manager.send_json_message({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }, client_id)
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Server error: {str(e)}"
        }, client_id)


async def handle_chat_message(data: dict, client_id: str, azure_clients: AzureClientManager):
    """Handle regular chat messages."""
    try:
        message = data.get("message", "")
        conversation_id = data.get("conversation_id")
        context_payload = data.get("context")
        history_payload = data.get("conversation_history")
        
        if not message:
            await manager.send_json_message({
                "type": "error",
                "message": "Message is required"
            }, client_id)
            return
        
        # Get the agent
        agent = azure_clients.get_azure_architect_agent()
        
        # Send typing indicator
        await manager.send_json_message({
            "type": "typing",
            "conversation_id": conversation_id
        }, client_id)
        
        context_dict = context_payload if isinstance(context_payload, dict) else None
        history_list = history_payload if isinstance(history_payload, list) else None

        # Get response from agent
        response = await agent.chat(
            message,
            conversation_history=history_list,
            context=context_dict,
        )
        
        # Send response
        await manager.send_json_message({
            "type": "chat_response",
            "message": response,
            "conversation_id": conversation_id,
            "timestamp": datetime.utcnow().isoformat()
        }, client_id)
        
        # Broadcast to conversation if others are listening
        if conversation_id:
            await manager.broadcast_to_conversation(conversation_id, {
                "type": "conversation_update",
                "conversation_id": conversation_id,
                "user_message": message,
                "assistant_message": response,
                "timestamp": datetime.utcnow().isoformat()
            })
        
    except Exception as e:
        logger.error(f"Error handling chat message: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to process message: {str(e)}"
        }, client_id)


async def handle_stream_chat(data: dict, client_id: str, azure_clients: AzureClientManager):
    """Handle streaming chat messages."""
    try:
        message = data.get("message", "")
        conversation_id = data.get("conversation_id")
        context_payload = data.get("context")
        history_payload = data.get("conversation_history")
        
        if not message:
            await manager.send_json_message({
                "type": "error",
                "message": "Message is required"
            }, client_id)
            return
        
        # Get the agent
        agent = azure_clients.get_azure_architect_agent()
        
        # Send start streaming indicator
        await manager.send_json_message({
            "type": "stream_start",
            "conversation_id": conversation_id
        }, client_id)
        
        context_dict = context_payload if isinstance(context_payload, dict) else None
        history_list = history_payload if isinstance(history_payload, list) else None

        # Stream response from agent
        full_response = ""
        async for chunk in agent.stream_chat(
            message,
            conversation_history=history_list,
            context=context_dict,
        ):
            full_response += chunk
            await manager.send_json_message({
                "type": "stream_chunk",
                "chunk": chunk,
                "conversation_id": conversation_id
            }, client_id)
        
        # Send end streaming indicator
        await manager.send_json_message({
            "type": "stream_end",
            "conversation_id": conversation_id,
            "full_message": full_response,
            "timestamp": datetime.utcnow().isoformat()
        }, client_id)
        
        # Broadcast to conversation if others are listening
        if conversation_id:
            await manager.broadcast_to_conversation(conversation_id, {
                "type": "conversation_update",
                "conversation_id": conversation_id,
                "user_message": message,
                "assistant_message": full_response,
                "timestamp": datetime.utcnow().isoformat()
            })
        
    except Exception as e:
        logger.error(f"Error handling stream chat: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to stream message: {str(e)}"
        }, client_id)


async def handle_join_conversation(data: dict, client_id: str):
    """Handle joining a conversation for real-time updates."""
    try:
        conversation_id = data.get("conversation_id")
        
        if not conversation_id:
            await manager.send_json_message({
                "type": "error",
                "message": "Conversation ID is required"
            }, client_id)
            return
        
        manager.add_to_conversation(conversation_id, client_id)
        
        await manager.send_json_message({
            "type": "conversation_joined",
            "conversation_id": conversation_id
        }, client_id)
        
    except Exception as e:
        logger.error(f"Error joining conversation: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to join conversation: {str(e)}"
        }, client_id)


async def handle_analyze_diagram(data: dict, client_id: str, azure_clients: AzureClientManager):
    """Handle diagram analysis via WebSocket."""
    try:
        diagram_data = data.get("diagram_data")
        target_region = data.get("target_region", "westeurope")
        conversation_id = data.get("conversation_id")
        
        if not diagram_data:
            await manager.send_json_message({
                "type": "error",
                "message": "Diagram data is required"
            }, client_id)
            return
        
        # Get the agent
        agent = azure_clients.get_azure_architect_agent()
        
        # Send processing indicator
        await manager.send_json_message({
            "type": "analysis_start",
            "conversation_id": conversation_id
        }, client_id)
        # Analyze diagram (synchronous function)
        diagram_json = json.dumps(diagram_data)
        analysis = analyze_diagram(diagram_json, target_region)
        
        # Send analysis result
        await manager.send_json_message({
            "type": "analysis_complete",
            "analysis": analysis,
            "conversation_id": conversation_id,
            "timestamp": datetime.utcnow().isoformat()
        }, client_id)
        
        # Broadcast to conversation if others are listening
        if conversation_id:
            await manager.broadcast_to_conversation(conversation_id, {
                "type": "diagram_analyzed",
                "conversation_id": conversation_id,
                "analysis": analysis,
                "timestamp": datetime.utcnow().isoformat()
            })
        
    except Exception as e:
        logger.error(f"Error analyzing diagram: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to analyze diagram: {str(e)}"
        }, client_id)


async def handle_deployment_websocket(websocket: WebSocket, client_id: str, azure_clients: AzureClientManager):
    """Handle WebSocket connections for deployment monitoring."""
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "monitor_deployment":
                await handle_monitor_deployment(data, client_id, azure_clients)
            elif message_type == "get_deployment_logs":
                await handle_get_deployment_logs(data, client_id, azure_clients)
            else:
                await manager.send_json_message({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }, client_id)
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Server error: {str(e)}"
        }, client_id)


async def handle_monitor_deployment(data: dict, client_id: str, azure_clients: AzureClientManager):
    """Handle deployment monitoring requests."""
    try:
        deployment_id = data.get("deployment_id")
        
        if not deployment_id:
            await manager.send_json_message({
                "type": "error",
                "message": "Deployment ID is required"
            }, client_id)
            return
        
        # TODO: Implement real deployment monitoring
        # For now, send periodic updates
        await manager.send_json_message({
            "type": "deployment_status",
            "deployment_id": deployment_id,
            "status": "monitoring_started"
        }, client_id)
        
    except Exception as e:
        logger.error(f"Error monitoring deployment: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to monitor deployment: {str(e)}"
        }, client_id)


async def handle_get_deployment_logs(data: dict, client_id: str, azure_clients: AzureClientManager):
    """Handle deployment log requests."""
    try:
        deployment_id = data.get("deployment_id")
        
        if not deployment_id:
            await manager.send_json_message({
                "type": "error",
                "message": "Deployment ID is required"
            }, client_id)
            return
        
        # Load logs from blob storage
        blob_client = azure_clients.get_blob_client()
        container_name = "deployments"
        blob_name = f"{deployment_id}/logs.json"
        
        try:
            blob_data = await blob_client.get_blob_client(
                container=container_name,
                blob=blob_name
            ).download_blob()
            
            logs_data = json.loads(await blob_data.readall())
            
            await manager.send_json_message({
                "type": "deployment_logs",
                "deployment_id": deployment_id,
                "logs": logs_data
            }, client_id)
            
        except Exception:
            # No logs found
            await manager.send_json_message({
                "type": "deployment_logs",
                "deployment_id": deployment_id,
                "logs": []
            }, client_id)
        
    except Exception as e:
        logger.error(f"Error getting deployment logs: {e}")
        await manager.send_json_message({
            "type": "error",
            "message": f"Failed to get deployment logs: {str(e)}"
        }, client_id)
