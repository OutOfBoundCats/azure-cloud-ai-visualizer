"""WebSocket routes for real-time communication."""

import logging
from uuid import uuid4
from fastapi import APIRouter, WebSocket

from app.websockets.handlers import handle_chat_websocket, handle_deployment_websocket
from app.core.azure_client import AzureClientManager

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_clients(websocket: WebSocket) -> AzureClientManager:
    app = getattr(websocket, "app", None)
    if app is None or not hasattr(app.state, "azure_clients"):
        raise RuntimeError("Azure clients are not configured on the application state")
    azure_clients = getattr(app.state, "azure_clients")
    if not isinstance(azure_clients, AzureClientManager):
        raise RuntimeError("Invalid Azure client manager on application state")
    return azure_clients


@router.websocket("/chat/{client_id}")
async def websocket_chat_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time chat with the Azure Architect Agent."""
    azure_clients = _resolve_clients(websocket)
    await handle_chat_websocket(websocket, client_id, azure_clients)


@router.websocket("/chat")
async def websocket_chat_endpoint_auto_id(websocket: WebSocket):
    """WebSocket endpoint for real-time chat with auto-generated client ID."""
    client_id = str(uuid4())
    azure_clients = _resolve_clients(websocket)
    await handle_chat_websocket(websocket, client_id, azure_clients)


@router.websocket("/deployment/{client_id}")
async def websocket_deployment_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket endpoint for real-time deployment monitoring."""
    azure_clients = _resolve_clients(websocket)
    await handle_deployment_websocket(websocket, client_id, azure_clients)


@router.websocket("/deployment")
async def websocket_deployment_endpoint_auto_id(websocket: WebSocket):
    """WebSocket endpoint for real-time deployment monitoring with auto-generated client ID."""
    client_id = str(uuid4())
    azure_clients = _resolve_clients(websocket)
    await handle_deployment_websocket(websocket, client_id, azure_clients)