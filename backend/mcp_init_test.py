import asyncio
import logging
import os

from app.core.config import settings

logger = logging.getLogger("mcp_init_test")


async def main():
    # Print config values for debugging
    print("settings.AZURE_MCP_BICEP_URL:", repr(settings.AZURE_MCP_BICEP_URL))
    print("settings.TERRAFORM_MCP_URL:", repr(settings.TERRAFORM_MCP_URL))
    print("ENV AZURE_MCP_BICEP_FORCE:", os.getenv("AZURE_MCP_BICEP_FORCE"))
    print("ENV TERRAFORM_MCP_FORCE:", os.getenv("TERRAFORM_MCP_FORCE"))
    try:
        from app.deps import get_mcp_bicep_tool, get_mcp_terraform_tool, cleanup_mcp_tools

        print("Attempting to get MCP Bicep tool...")
        b = await get_mcp_bicep_tool()
        print("Bicep tool:", type(b), getattr(b, "is_connected", None))

        print("Attempting to get MCP Terraform tool...")
        t = await get_mcp_terraform_tool()
        print("Terraform tool:", type(t), getattr(t, "is_connected", None))

    except Exception as e:
        print("Exception during MCP init:", repr(e))
    finally:
        try:
            from app.deps import cleanup_mcp_tools

            await cleanup_mcp_tools()
            print("Cleanup complete")
        except Exception as e:
            print("Cleanup error:", repr(e))


if __name__ == "__main__":
    # Enable DEBUG logs for deeper diagnostics during MCP session init
    logging.basicConfig(level=logging.DEBUG)
    # Increase verbosity for agent_framework and mcp packages
    logging.getLogger("agent_framework").setLevel(logging.DEBUG)
    logging.getLogger("mcp").setLevel(logging.DEBUG)
    asyncio.run(main())
