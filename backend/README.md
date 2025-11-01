# Azure Architect Backend

Python backend for the Azure Architect application, providing:
- Azure OpenAI agent integration with Microsoft Agent Framework (MAF)
- **OpenAI fallback support** for easier development and testing
- ReactFlow diagram to Bicep/Terraform IaC generation
- Azure deployment orchestration
- Real-time chat and WebSocket support
- **Vision capabilities** for architecture diagram analysis
- Project and asset management with Azure Blob storage

## Architecture

Based on the requirements in `../Task.md`, this backend provides:

1. **Web API** (FastAPI)
   - Project CRUD operations
   - Asset upload/download (SAS tokens)
   - IaC generation endpoints
   - Azure deployment management

2. **MAF Agent Integration**
   - Chat-driven architecture planning
   - IaC generation with Azure OpenAI
   - Tool calling for Azure operations
   - Real-time conversation streaming

3. **Azure Services Integration**
   - Blob Storage for projects/assets
   - Azure OpenAI for code generation
   - Azure CLI for deployments
   - Key Vault for secrets
   - Application Insights for monitoring

## Quick Start (OpenAI Mode)

For easy development without Azure setup:

1. Install dependencies:
   ```bash
   uv install
   ```

2. Set up OpenAI fallback:
   ```bash
   cp .env.example .env
   # Edit .env and set:
   # USE_OPENAI_FALLBACK=true
   # OPENAI_API_KEY=your_openai_key_here
   ```

3. Run development server:
   ```bash
   uv run uvicorn main:app --reload --port 8000
   ```

4. Test the integration:
   ```bash
   python test_openai.py
   ```

## Full Setup (Azure Mode)

For production with full Azure integration:

1. Install dependencies:
   ```bash
   uv install
   ```

2. Set environment variables (copy from `.env.example`):
   ```bash
   cp .env.example .env
   # Edit .env with your Azure credentials
   # Ensure USE_OPENAI_FALLBACK=false
   ```

3. Run development server:
   ```bash
   uv run uvicorn main:app --reload --port 8000
   ```

See [OPENAI_INTEGRATION.md](./OPENAI_INTEGRATION.md) for detailed configuration guide.

## API Endpoints

- `POST /api/projects` - Create project
- `GET /api/projects/{id}` - Get project
- `POST /api/upload-url` - Get SAS upload URL
- `POST /api/iac/generate` - Generate IaC from diagram
- `POST /api/deploy/plan` - Plan Azure deployment
- `POST /api/deploy/apply` - Execute deployment
- `WS /ws/chat` - Real-time chat with MAF agent
- `WS /ws/logs/{job_id}` - Stream deployment logs

## Environment Variables

See `.env.example` for required configuration.