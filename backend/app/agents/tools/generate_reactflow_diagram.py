"""
Azure Architect MAF Agent

This module implements the Microsoft Agent Framework integration for:
- Chat-driven architecture planning
- IaC generation from ReactFlow diagrams
- Azure deployment guidance
- Tool calling for canvas operations
"""

import json
import logging
from typing import Annotated
from pydantic import Field

logger = logging.getLogger(__name__)

def generate_reactflow_diagram(
    architecture_description: Annotated[str, Field(description="Natural language description of the architecture")],
    include_connections: Annotated[bool, Field(description="Whether to include connections between services")] = True
) -> str:
    """Generate a ReactFlow diagram JSON from architecture description."""
    try:
        # Parse common Azure services from description
        services = []
        service_mapping = {
            "web app": {"type": "azure.appservice", "icon": "mdi:web"},
            "function": {"type": "azure.functions", "icon": "mdi:lambda"},
            "storage": {"type": "azure.storage", "icon": "mdi:database"},
            "database": {"type": "azure.sql", "icon": "mdi:database-outline"},
            "cosmos": {"type": "azure.cosmos", "icon": "mdi:database-outline"},
            "redis": {"type": "azure.redis", "icon": "mdi:memory"},
            "api management": {"type": "azure.apim", "icon": "mdi:api"},
            "front door": {"type": "azure.frontdoor", "icon": "mdi:door"},
            "azure front door": {"type": "azure.frontdoor", "icon": "mdi:door"},
            "application gateway": {"type": "azure.appgateway", "icon": "mdi:gateway"},
            "openai": {"type": "azure.openai", "icon": "mdi:robot"},
            "ai search": {"type": "azure.search", "icon": "mdi:magnify"},
            "key vault": {"type": "azure.keyvault", "icon": "mdi:key"},
            "monitor": {"type": "azure.monitor", "icon": "mdi:monitor"},
            "insights": {"type": "azure.insights", "icon": "mdi:chart-line"}
        }
        
        description_lower = architecture_description.lower()
        node_id = 1
        
        # Generate nodes based on detected services
        nodes = []
        edges = []
        
        for service_name, service_config in service_mapping.items():
            if service_name in description_lower:
                node = {
                    "id": f"node_{node_id}",
                    "type": "azureService",
                    "position": {"x": (node_id - 1) * 200 + 100, "y": 100 + ((node_id - 1) % 3) * 150},
                    "data": {
                        "title": service_name.title(),
                        "subtitle": "Azure Service",
                        "icon": service_config["icon"],
                        "type": service_config["type"],
                        "status": "inactive"
                    }
                }
                nodes.append(node)
                node_id += 1
        
        # Generate basic connections if requested
        if include_connections and len(nodes) > 1:
            for i in range(len(nodes) - 1):
                edge = {
                    "id": f"edge_{i}",
                    "source": nodes[i]["id"],
                    "target": nodes[i + 1]["id"],
                    "type": "default",
                    "data": {"protocol": "HTTPS"}
                }
                edges.append(edge)
        
        # Create ReactFlow diagram
        diagram = {
            "nodes": nodes,
            "edges": edges,
            "viewport": {"x": 0, "y": 0, "zoom": 1}
        }
        
        return json.dumps(diagram, indent=2)
        
    except Exception as e:
        return f"Error generating ReactFlow diagram: {str(e)}"

