import json
import logging
from typing import Annotated
from pydantic import Field
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)


# Tool functions for the agent
def analyze_diagram(
    diagram_json: Annotated[str, Field(description="ReactFlow diagram JSON string")],
    target_region: Annotated[str, Field(description="Target Azure region for deployment")] = "westeurope"
) -> str:
    """Analyze a ReactFlow diagram and provide architecture insights."""
    try:
        # Parse diagram JSON safely
        if isinstance(diagram_json, str):
            try:
                diagram = json.loads(diagram_json)
            except Exception:
                diagram = {"nodes": [], "edges": []}
        elif isinstance(diagram_json, dict):
            diagram = diagram_json
        else:
            diagram = {"nodes": [], "edges": []}

        nodes = diagram.get("nodes", [])

        # Resource naming helpers and maps
        resource_symbols = {}

        def symbol_name(idx: int, kind: str) -> str:
            return f"res{idx}_{kind}"

        # Helper to safe-get data fields
        def get_field(d: dict, *keys, default=None):
            for k in keys:
                if k in d:
                    return d[k]
            return default

        # Normalize node metadata so generator can detect types
        for i, node in enumerate(nodes):
            node_data = node.get("data", {}) or {}
            title = str(get_field(node_data, "title", default=f"resource{i}"))
            # Try several places for a resource type: explicit resourceType, type, or title keywords
            rtype = get_field(node_data, "resourceType", "type", default=None)
            if isinstance(rtype, str) and rtype.strip() == "":
                rtype = None

            detected = None
            if rtype:
                rt = str(rtype).lower()
                if "storage" in rt:
                    detected = "storage"
                elif "web" in rt or "function" in rt:
                    detected = "function"
                elif "sql" in rt and "cosmos" not in rt:
                    detected = "sql"
                elif "cosmos" in rt:
                    detected = "cosmos"
                elif "redis" in rt:
                    detected = "redis"
                elif "network" in rt or "vnet" in rt:
                    detected = "vnet"

            if detected is None:
                lt = title.lower()
                if "storage" in lt or "blob" in lt:
                    detected = "storage"
                elif "function" in lt or "func" in lt:
                    detected = "function"
                elif "sql" in lt or "database" in lt:
                    detected = "sql"
                elif "cosmos" in lt:
                    detected = "cosmos"
                elif "redis" in lt:
                    detected = "redis"
                elif "vnet" in lt or "subnet" in lt or "network" in lt:
                    detected = "vnet"
                elif "monitor" in lt or "activity log" in lt or "advisor" in lt or "insights" in lt:
                    detected = "monitor"
                elif "identity" in (node_data.get("category") or "").lower() or "active directory" in lt or "ad" in lt:
                    detected = "identity"
                elif "machine" in lt or "ml" in lt or "learning" in lt or "ai" in (node_data.get("category") or "").lower():
                    detected = "machinelearning"
                else:
                    detected = "generic"

            resource_symbols[node.get("id", str(i))] = {
                "symbol": symbol_name(i, detected),
                "kind": detected,
                "title": title,
                "data": node_data,
                "index": i,
            }

        return json.dumps(resource_symbols, indent=2)

    except Exception as e:
        logger.error(f"Error analyzing diagram: {e}")
        return json.dumps({"error": str(e)})

