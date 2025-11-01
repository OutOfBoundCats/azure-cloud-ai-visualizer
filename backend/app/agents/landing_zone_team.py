# app/agents/teams/landing_zone_team.py
import asyncio
import inspect
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from agent_framework import ChatMessage, Role, SequentialBuilder, ConcurrentBuilder, WorkflowOutputEvent

from app.obs.tracing import tracer, TraceEvent

logger = logging.getLogger(__name__)

WAF_PILLARS = ["Security", "Reliability", "Cost Optimization", "Operational Excellence", "Performance Efficiency"]

DIAGRAM_SECTION_REGEX = re.compile(
    r"Diagram JSON\s*```json\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)

STRUCTURED_DIAGRAM_GUIDANCE = (
    "Always append a section titled `Diagram JSON` followed by a fenced ```json block that matches this schema:\n"
    "{\n"
    "  \"services\": [\n"
    "    {\n"
    "      \"id\": \"<azure icon id e.g. analytics/00039-icon-service-Event-Hubs>\",\n"
    "      \"title\": \"<service title matching the icon>\",\n"
    "      \"category\": \"<Azure catalog category>\",\n"
    "      \"description\": \"<one-sentence usage note>\",\n"
    "      \"groupIds\": [\"<group id(s) that contain this service>\"]\n"
    "    }\n"
    "  ],\n"
    "  \"groups\": [\n"
    "    {\n"
    "      \"id\": \"<container icon id e.g. general/10011-icon-service-Management-Groups>\",\n"
    "      \"label\": \"<friendly label>\",\n"
    "      \"type\": \"<managementGroup|subscription|region|landingZone|resourceGroup|virtualNetwork|subnet|cluster|networkSecurityGroup|securityBoundary|policyAssignment|roleAssignment|default>\",\n"
    "      \"parentId\": \"<optional parent group id>\",\n"
    "      \"members\": [\"<ids of services or nested groups>\"]\n"
    "    }\n"
    "  ],\n"
    "  \"connections\": [\n"
    "    { \"from\": \"<service id>\", \"to\": \"<service id>\", \"label\": \"<data/control flow>\" }\n"
    "  ],\n"
    "  \"layout\": \"<horizontal|vertical|grid>\"\n"
    "}\n"
    "Layout expectations:\n"
    "- Create a hierarchical tree: managementGroup → subscription (or landingZone) → region → resourceGroup → workloads.\n"
    "- Every group MUST include its children in `members`, and every child must reference its parent via `parentId` or `groupIds`.\n"
    "- Services must belong to at least one non-default group that reflects their scope (region, resource group, subnet, etc.).\n"
    "- If multiple regions exist, create a region group per geography under the subscription and nest the regional services beneath it.\n"
    "- Use dedicated group entries for networks (virtualNetwork, subnet, networkSecurityGroup) so the parser can place nodes correctly.\n"
    "- Prefer a grid layout for wide topologies; use vertical flow for linear workloads.\n"
    "Use the official Azure icon identifiers shipped with the app (e.g., analytics/00039-icon-service-Event-Hubs).\n"
    "Represent containers (management groups, subscriptions, landing zones, regions, virtual networks, subnets, clusters, NSGs) ONLY inside the `groups` array—never duplicate them as plain services.\n"
    "Every Azure workload or control-plane component you mention must appear in the `services` array; do not omit services for brevity.\n"
    "Include every meaningful integration in the `connections` array so the canvas shows the full topology (ingress → app tier → data tier → monitoring, etc.).\n"
    "Keep the JSON valid (no comments or trailing commas) and update it whenever you change the design."
)

def _agent(chat_client, name: str, instructions: str):
    return chat_client.create_agent(name=name, instructions=instructions)

def _security_instr():
    return (
        "You are a strict Azure security reviewer. Rework the previous assistant message to enforce:\n"
        "- Network isolation (vnet/subnets, private endpoints), NSGs/ASGs, AppGW/Front Door WAF\n"
        "- Identity: Entra ID, managed identities, least-priv RBAC, PIM hints\n"
        "- Secrets: Key Vault, no inline secrets, CMK options\n"
        "- Defender for Cloud/Threat Protection, logs to LA Workspace, diagnostic settings\n"
        "- Data exfil protection, storage SAS disable, httpsOnly\n"
        "Output: improved architecture + short bullet list of security remediations.\n"
        "Do not remove existing services or groups—enhance them with additional security components when needed, and ensure every new service is added to the `Diagram JSON` with correct parentage and connections.\n"
        "Preserve the existing `Diagram JSON` section, updating it if you add or remove services."
    )

def _naming_instr():
    return (
        "You are an Azure naming enforcer. Rewrite resource names to official Azure naming conventions used by this org. "
        "Add tags { env, owner, costCenter, dataClassification }. Keep the technical design intact. "
        "Do not drop any services or groups configured by previous reviewers; instead, ensure naming/tagging consistency across the full set.\n"
        "Output only the updated architecture text and the naming table. Preserve and adjust the `Diagram JSON` section."
    )

def _reliability_instr():
    return (
        "You are an Azure reliability reviewer. Enforce multi-AZ/region strategy where appropriate, "
        "backup/restore, DR/RTO/RPO notes, autoscale and health probes. "
        "If redundancy requires additional services (e.g., paired regions, geo-redundant storage), add them while keeping all previously defined components.\n"
        "Output: improved architecture + a Reliability checklist with decisions. Update the `Diagram JSON` section to reflect any topology changes."
    )

def _cost_perf_instr():
    return (
        "You are an Azure cost/perf optimizer. Right-size SKUs, reserve/spot where relevant, "
        "auto-pause for dev/test, lifecycle policies for storage, caching layers, query patterns. "
        "Retain the full architecture footprint—apply cost guidance without deleting tiers; add shared services (e.g., caching, autoscale rules) only when they complement the design.\n"
        "Output: improved architecture + 5 concrete cost levers. Maintain the `Diagram JSON` section and adjust resource SKUs there when needed."
    )

def _compliance_instr():
    return (
        "You are a fintech compliance reviewer. Call out items related to audit logging, immutable logs, "
        "separation of duties, data residency, encryption, and key management. "
        "Preserve every existing workload; add required governance components (e.g., Policy, Blueprints, Monitor, Purview) rather than replacing services, and record them in the `Diagram JSON` with proper hierarchy.\n"
        "Output: improved architecture + short compliance checklist. Ensure any compliance-driven changes are reflected inside the `Diagram JSON` output."
    )

def _final_editor_instr():
    return (
        "You are the final editor. Merge the latest improvements into a clean final answer with sections:\n"
        "1) Overview, 2) Architecture diagram description, 3) Security, 4) Reliability, 5) Cost, 6) Compliance, "
        "7) Diagram JSON (per the required schema), 8) Optional Bicep/Terraform plan notes.\n"
        f"{STRUCTURED_DIAGRAM_GUIDANCE}"
    )

def _writer_instr():
    return (
        "You are the principal Azure architect. Produce the FIRST DRAFT for the user prompt. "
        "Cover: management groups, subscriptions/LZs, hub-spoke networking, identity, secrets, data, compute, "
        f"observability, automation, and explicitly touch the five Well-Architected pillars: {', '.join(WAF_PILLARS)}. "
        "Model the landing zone as a tree: management group -> subscription/landing zone -> regions -> resource groups -> workloads with vnets/subnets as separate containers. "
        "List every Azure service you recommend in the diagram JSON `services` array using the official icon ids provided by the app's catalogue. "
        "End with `Diagram JSON` as requested by the app.\n"
        f"{STRUCTURED_DIAGRAM_GUIDANCE}"
    )
def _identity_instr():
    return (
        "You are an Identity & Governance reviewer. Review the draft for Entra ID design, role assignments, \n"
        "managed identities, least-privilege RBAC, PIM hints, subscription/management-group boundaries, \n"
        "and suggest Azure Policy initiatives or guardrails. Output a concise RBAC plan, policy suggestions, \n"
        "and any required changes to the Diagram JSON."
    )


def _networking_instr():
    return (
        "You are a Networking reviewer. Validate the network topology for hub-spoke or other recommended patterns, \n"
        "private endpoints, NSG/ASG placement, peering, routing, and hybrid connectivity. Provide concrete changes \n"
        "to the Diagram JSON and a short justification for each network decision."
    )


def _observability_instr():
    return (
        "You are an Observability reviewer. Ensure the design includes monitoring, logging, diagnostic settings, \n"
        "Log Analytics/metrics placement, alert rules, and SLOs. Return a monitoring checklist, recommended \n"
        "telemetry resources, and any Diagram JSON additions needed to represent monitoring/logging components."
    )


def _data_storage_instr():
    return (
        "You are a Data & Storage reviewer. Evaluate data flows, storage choices, retention, backups, encryption, \n"
        "and data residency. Recommend storage account configurations, database choices, lifecycle policies, \n"
        "and backup/restore strategies. Provide any Diagram JSON updates needed to represent data storage components."
    )

class LandingZoneTeam:
    def __init__(self, agent_source):
        """
        Initialize the landing zone team.

        `agent_source` can be either the high-level AzureArchitectAgent or the raw chat client.
        When the full agent is supplied we retain a reference so we can invoke its IaC generators.
        """
        self.architect_agent = None
        if hasattr(agent_source, "agent_client"):
            # We received the AzureArchitectAgent wrapper.
            self.architect_agent = agent_source
            chat_client = agent_source.agent_client
        else:
            chat_client = agent_source

        if not hasattr(chat_client, "create_agent"):
            raise ValueError("Agent client must provide a create_agent method for team orchestration")

        self.chat_client = chat_client

        # Base writer
        self.writer = _agent(self.chat_client, "Architect", _writer_instr())

        # Sequential reviewers
        self.security = _agent(self.chat_client, "SecurityReviewer", _security_instr())
        self.identity = _agent(self.chat_client, "IdentityGovernanceReviewer", _identity_instr())
        self.naming   = _agent(self.chat_client, "NamingEnforcer", _naming_instr())
        self.reliab   = _agent(self.chat_client, "ReliabilityReviewer", _reliability_instr())
        self.networking = _agent(self.chat_client, "NetworkingReviewer", _networking_instr())
        self.cost     = _agent(self.chat_client, "CostPerfOptimizer", _cost_perf_instr())
        self.comp     = _agent(self.chat_client, "ComplianceReviewer", _compliance_instr())
        self.observability = _agent(self.chat_client, "ObservabilityReviewer", _observability_instr())
        self.data_storage = _agent(self.chat_client, "DataStorageReviewer", _data_storage_instr())
        self.final    = _agent(self.chat_client, "FinalEditor", _final_editor_instr())

        # Build the default sequential pipeline (writer -> reviewers -> final)
        # Sequential pipeline: writer -> security -> identity -> naming -> reliability -> cost -> compliance -> final
        self.seq_workflow = (
            SequentialBuilder()
            .participants([
                self.writer,
                self.security,
                self.identity,
                self.naming,
                self.reliab,
                self.cost,
                self.comp,
                self.final,
            ])
            .build()
        )

        # Optional concurrent pass (security/reliability/cost in parallel) feeding a final editor
        # Note: ConcurrentBuilder does not provide an `aggregator` method, so build only the concurrent reviewers here
        # Concurrent fan-out for independent reviewers: reliability, cost, networking, observability, data_storage
        self.concurrent_workflow = (
            ConcurrentBuilder()
            .participants([self.reliab, self.cost, self.networking, self.observability, self.data_storage])
            .build()
        )

    async def run_sequential(self, user_prompt: str) -> str:
        last_output: Optional[List[ChatMessage]] = None
        async for ev in self.seq_workflow.run_stream(user_prompt):
            if isinstance(ev, WorkflowOutputEvent):
                last_output = ev.data
        if not last_output:
            return "No output."
        return "\n".join([m.text for m in last_output if m.role in (Role.ASSISTANT,)])

    async def run_with_parallel_pass(self, user_prompt: str) -> str:
        # First draft
        draft = await self.writer.run(user_prompt)
        messages = list(draft.messages)

        # Fan-out reviewers on the draft, collect all reviewer outputs
        collected_messages = []
        async for ev in self.concurrent_workflow.run_stream(messages):
            if isinstance(ev, WorkflowOutputEvent):
                data = ev.data
                # ev.data may be a list of ChatMessage, a response object with .messages, or a single message-like object
                if isinstance(data, list):
                    collected_messages.extend(data)
                else:
                    messages_attr = getattr(data, "messages", None)
                    if messages_attr is not None:
                        collected_messages.extend(list(messages_attr))
                        continue
                    collected_messages.append(data)

        # If reviewers produced no output, fall back to the draft's last assistant text
        if not collected_messages:
            return draft.messages[-1].text

        # Run final editor over the combined reviewer outputs
        final = await self.final.run(collected_messages)
        # final might be an object with .messages or a simple string; prefer the last assistant text when available
        if hasattr(final, "messages") and final.messages:
            return final.messages[-1].text
        return str(final)

    @staticmethod
    def _extract_diagram_payload(final_text: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        if not final_text:
            return None, None
        match = DIAGRAM_SECTION_REGEX.search(final_text)
        if not match:
            return None, None
        raw_json = match.group(1).strip()
        try:
            return json.loads(raw_json), raw_json
        except json.JSONDecodeError as exc:
            logger.warning("LandingZoneTeam failed to parse Diagram JSON: %s", exc)
            return None, raw_json

    async def _generate_iac_bundle(
        self,
        diagram: Optional[Dict[str, Any]],
        narrative: str,
        region: str = "westeurope",
    ) -> Dict[str, Any]:
        """Produce Bicep and Terraform artifacts using the AzureArchitectAgent when available."""
        bundle: Dict[str, Any] = {"bicep": None, "terraform": None}
        agent = self.architect_agent
        if not agent:
            logger.debug("LandingZoneTeam has no architect agent reference; skipping IaC generation.")
            return bundle

        diagram_payload: Dict[str, Any] | None = None
        if isinstance(diagram, dict):
            diagram_payload = diagram

        async def _generate_bicep() -> Optional[Dict[str, Any]]:
            try:
                if diagram_payload:
                    generate_via_mcp = getattr(agent, "generate_bicep_via_mcp", None)
                    if callable(generate_via_mcp):
                        return await generate_via_mcp(diagram_payload, region=region)
                    generate_bicep = getattr(agent, "generate_bicep_code", None)
                    if callable(generate_bicep):
                        return await generate_bicep({"diagram": diagram_payload})
                generate_bicep = getattr(agent, "generate_bicep_code", None)
                if callable(generate_bicep):
                    return await generate_bicep(narrative)
                logger.warning("LandingZoneTeam could not locate generate_bicep_code on architect agent.")
            except Exception:
                logger.exception("LandingZoneTeam failed to generate Bicep")
                return None

        async def _generate_terraform() -> Optional[Dict[str, Any]]:
            try:
                generate_tf = getattr(agent, "generate_terraform_code", None)
                if not callable(generate_tf):
                    logger.warning("LandingZoneTeam could not locate generate_terraform_code on architect agent.")
                    return None
                if diagram_payload:
                    return await generate_tf({"diagram": diagram_payload})
                return await generate_tf(narrative)
            except Exception:
                logger.exception("LandingZoneTeam failed to generate Terraform")
                return None

        tasks = [
            asyncio.create_task(_generate_bicep()),
            asyncio.create_task(_generate_terraform()),
        ]
        bicep_result, terraform_result = await asyncio.gather(*tasks)

        if bicep_result and isinstance(bicep_result, dict):
            bundle["bicep"] = bicep_result
        if terraform_result and isinstance(terraform_result, dict):
            bundle["terraform"] = terraform_result

        logger.debug(
            "LandingZoneTeam IaC bundle generated: bicep=%s terraform=%s",
            "yes" if bundle["bicep"] else "no",
            "yes" if bundle["terraform"] else "no",
        )
        return bundle

    async def _diagram_from_iac(
        self, narrative: str, iac_bundle: Dict[str, Any]
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        agent = self.architect_agent
        if not agent:
            return None, None
        chat_agent = getattr(agent, "chat_agent", None)
        if not chat_agent:
            return None, None

        bicep_template = None
        terraform_template = None
        bicep_payload = iac_bundle.get("bicep") if isinstance(iac_bundle, dict) else None
        terraform_payload = iac_bundle.get("terraform") if isinstance(iac_bundle, dict) else None
        if isinstance(bicep_payload, dict):
            bicep_template = bicep_payload.get("bicep_code") or bicep_payload.get("content")
        if isinstance(terraform_payload, dict):
            terraform_template = terraform_payload.get("terraform_code") or terraform_payload.get("content")

        source_snippet = None
        source_language = None
        if isinstance(bicep_template, str) and bicep_template.strip():
            source_snippet = bicep_template.strip()
            source_language = "bicep"
        elif isinstance(terraform_template, str) and terraform_template.strip():
            source_snippet = terraform_template.strip()
            source_language = "terraform"

        if not source_snippet:
            return None, None

        prompt = (
            "You are an Azure architecture cartographer. Convert the following IaC template into the structured "
            "ReactFlow diagram JSON used by the canvas. Follow the schema and hierarchy guidance exactly.\n\n"
            f"{STRUCTURED_DIAGRAM_GUIDANCE}\n"
            "The IaC template:\n"
            f"```{source_language}\n{source_snippet}\n```\n\n"
            "Return ONLY the JSON object (no commentary) that conforms to the schema."
        )

        try:
            response = await chat_agent.run(prompt)
            text = getattr(response, "result", None)
            if not isinstance(text, str):
                text = getattr(response, "text", None) or str(response)
            if not isinstance(text, str):
                return None, None

            # Extract JSON payload from response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start == -1 or end <= start:
                return None, None
            json_blob = text[start:end]
            parsed = json.loads(json_blob)
            if not isinstance(parsed, dict):
                return None, None
            raw_json = json.dumps(parsed, indent=2)
            return parsed, raw_json
        except Exception as exc:
            logger.warning("Failed to derive diagram from IaC: %s", exc)
            return None, None

    @staticmethod
    def _inject_diagram_section(report: str, raw_json: str) -> str:
        payload = f"Diagram JSON\n```json\n{raw_json}\n```"
        if DIAGRAM_SECTION_REGEX.search(report or ""):
            return DIAGRAM_SECTION_REGEX.sub(payload, report, count=1)
        return f"{report.rstrip()}\n\n{payload}"
    
    async def _run_agent_streamed(self, run_id: str, step_idx: int, total: int, agent, input_messages, meta=None) -> str:
        start_ts = time.time()
        name = getattr(agent, "name", "Agent")
        step_id = str(step_idx)

        await tracer.emit(TraceEvent(
            run_id=run_id, step_id=step_id, agent=name, phase="start",
            ts=time.time(), meta=meta or {}, progress={"current": step_idx, "total": total},
            telemetry={"tokens_in": 0, "tokens_out": 0, "latency_ms": 0}
        ))

        out_text: list[str] = []
        last_response_text: str | None = None
        tokens_out = 0

        try:
            async for chunk in agent.run_stream(input_messages):
                text_payloads: list[str] = []

                delta = getattr(chunk, "delta", None)
                if delta:
                    if isinstance(delta, str) and delta.strip():
                        text_payloads.append(delta)
                    else:
                        candidate = getattr(delta, "text", None) or getattr(delta, "content", None)
                        if isinstance(candidate, str) and candidate.strip():
                            text_payloads.append(candidate)

                # Some clients stream ChatMessage objects via messages attribute
                messages_attr = getattr(chunk, "messages", None)
                if messages_attr:
                    try:
                        for msg in messages_attr:
                            candidate = getattr(msg, "text", None) or getattr(msg, "content", None)
                            if isinstance(candidate, str) and candidate.strip():
                                text_payloads.append(candidate)
                    except TypeError:
                        # Not iterable; ignore
                        pass

                # Capture full responses when provided for later fallback
                response_attr = getattr(chunk, "response", None)
                if response_attr is not None:
                    # Prefer explicit result property when present
                    candidate = getattr(response_attr, "result", None)
                    if isinstance(candidate, str) and candidate.strip():
                        last_response_text = candidate
                    # Otherwise look for messages collection
                    messages = getattr(response_attr, "messages", None)
                    if messages:
                        try:
                            collected = []
                            for msg in messages:
                                msg_text = getattr(msg, "text", None) or getattr(msg, "content", None)
                                if isinstance(msg_text, str) and msg_text.strip():
                                    collected.append(msg_text)
                            if collected:
                                last_response_text = "\n".join(collected)
                        except TypeError:
                            pass

                # Fallback for dict-based chunks
                if not text_payloads and isinstance(chunk, dict):
                    candidate = chunk.get("delta") or chunk.get("text") or chunk.get("content")
                    if isinstance(candidate, str) and candidate.strip():
                        text_payloads.append(candidate)

                for text in text_payloads:
                    out_text.append(text)
                    tokens_out += len(text.split())  # lightweight proxy
                    await tracer.emit(TraceEvent(
                        run_id=run_id, step_id=step_id, agent=name, phase="delta",
                        ts=time.time(), meta=meta or {}, progress={"current": step_idx, "total": total},
                        telemetry={"tokens_in": 0, "tokens_out": tokens_out, "latency_ms": int((time.time()-start_ts)*1000)},
                        message_delta=text
                    ))
        except Exception as e:
            await tracer.emit(TraceEvent(
                run_id=run_id, step_id=step_id, agent=name, phase="error",
                ts=time.time(), meta=meta or {}, progress={"current": step_idx, "total": total},
                telemetry={"tokens_in": 0, "tokens_out": tokens_out, "latency_ms": int((time.time()-start_ts)*1000)},
                error=str(e)
            ))
            raise

        final = "".join(out_text)
        if not final and last_response_text:
            final = last_response_text
        if not final:
            run_fn = getattr(agent, "run", None)
            if callable(run_fn):
                try:
                    result = run_fn(input_messages)
                    if inspect.isawaitable(result):
                        result = await result
                    candidate = getattr(result, "result", None)
                    if isinstance(candidate, str) and candidate.strip():
                        final = candidate
                    elif isinstance(result, str) and result.strip():
                        final = result
                    else:
                        messages = getattr(result, "messages", None)
                        if messages:
                            collected = []
                            for msg in messages:
                                msg_text = getattr(msg, "text", None) or getattr(msg, "content", None)
                                if isinstance(msg_text, str) and msg_text.strip():
                                    collected.append(msg_text)
                            if collected:
                                final = "\n".join(collected)
                except Exception:
                    # Ignore fallback failures- streaming result already handled
                    pass
        await tracer.emit(TraceEvent(
            run_id=run_id, step_id=step_id, agent=name, phase="end",
            ts=time.time(), meta=meta or {}, progress={"current": step_idx, "total": total},
            telemetry={"tokens_in": 0, "tokens_out": tokens_out, "latency_ms": int((time.time()-start_ts)*1000)},
            summary=f"{name} completed"
        ))
        return final

    async def run_sequential_traced(
        self, user_prompt: str, run_id: Optional[str] = None
    ) -> Tuple[str, Optional[Dict[str, Any]], Optional[str], Dict[str, Any], str]:
        run_id = run_id or tracer.new_run()
        tracer.ensure_run(run_id)
        # Sequential pipeline now: Architect + Security + Identity + Naming + Reliability + Cost + Compliance + FinalEditor
        pipeline = [
            self.writer,
            self.security,
            self.identity,
            self.naming,
            self.reliab,
            self.cost,
            self.comp,
            self.final,
        ]
        messages = user_prompt
        outputs = []
        waf_map = [
            "-",
            "Security",
            "Identity & Governance",
            "Operational Excellence",
            "Reliability",
            "Cost Optimization",
            "Compliance",
            "-",
        ]

        for i, ag in enumerate(pipeline, start=1):
            out = await self._run_agent_streamed(
                run_id,
                i,
                len(pipeline),
                ag,
                messages,
                meta={"waf_pillar": waf_map[i - 1]},
            )
            messages = out  # pass to next
            outputs.append(out)

        final_text = outputs[-1] if outputs else "No output."
        diagram_dict, raw_json = self._extract_diagram_payload(final_text)
        iac_bundle = await self._generate_iac_bundle(diagram_dict, final_text)
        derived_diagram, derived_raw = await self._diagram_from_iac(final_text, iac_bundle)
        if derived_diagram:
            diagram_dict = derived_diagram
            raw_json = derived_raw
            if raw_json:
                final_text = self._inject_diagram_section(final_text, raw_json)
        return final_text, diagram_dict, raw_json, iac_bundle, run_id

    async def run_parallel_pass_traced(
        self, user_prompt: str, run_id: Optional[str] = None
    ) -> Tuple[str, Optional[Dict[str, Any]], Optional[str], Dict[str, Any], str]:
        run_id = run_id or tracer.new_run()
        tracer.ensure_run(run_id)
        # First draft
        # total steps: draft (1) + 5 parallel reviewers (2..6) + final (7)
        total_steps = 7
        draft = await self._run_agent_streamed(run_id, 1, total_steps, self.writer, user_prompt, meta={"waf_pillar": "-"})

        # Fan-out reviewers (reliability, cost, networking, observability, data/storage)
        async def _run_reviewer(idx, ag, meta):
            return await self._run_agent_streamed(run_id, idx, total_steps, ag, draft, meta=meta)

        results = await asyncio.gather(
            _run_reviewer(2, self.reliab, {"parallel_group": "fanout-1", "waf_pillar": "Reliability"}),
            _run_reviewer(3, self.cost,   {"parallel_group": "fanout-1", "waf_pillar": "Cost Optimization"}),
            _run_reviewer(4, self.networking, {"parallel_group": "fanout-1", "waf_pillar": "Networking"}),
            _run_reviewer(5, self.observability, {"parallel_group": "fanout-1", "waf_pillar": "Observability"}),
            _run_reviewer(6, self.data_storage, {"parallel_group": "fanout-1", "waf_pillar": "Data & Storage"}),
        )
        merged_input = "\n\n---\n\n".join(results)
        final = await self._run_agent_streamed(run_id, total_steps, total_steps, self.final, merged_input, meta={"aggregator": "FinalEditor"})
        diagram_dict, raw_json = self._extract_diagram_payload(final)
        iac_bundle = await self._generate_iac_bundle(diagram_dict, final)
        derived_diagram, derived_raw = await self._diagram_from_iac(final, iac_bundle)
        if derived_diagram:
            diagram_dict = derived_diagram
            raw_json = derived_raw
            if raw_json:
                final = self._inject_diagram_section(final, raw_json)
        return final, diagram_dict, raw_json, iac_bundle, run_id
