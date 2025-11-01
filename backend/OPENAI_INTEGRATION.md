# OpenAI Integration Guide

This guide explains how to use OpenAI as a fallback for the Azure Architect Agent, making development and testing easier without requiring a full Azure setup.

## Overview

The system supports two modes:
1. **Azure Mode** (default): Uses Azure AI Project with Microsoft Agent Framework
2. **OpenAI Fallback Mode**: Uses OpenAI directly for easier testing and development

## Configuration

### OpenAI Fallback Mode

To use OpenAI instead of Azure, set these environment variables in your `.env` file:

```bash
USE_OPENAI_FALLBACK=true
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o
```

### Azure Mode (Production)

For production use with Azure:

```bash
USE_OPENAI_FALLBACK=false
AZURE_AI_PROJECT_ENDPOINT=https://your-project.cognitiveservices.azure.com/
AZURE_AI_MODEL_DEPLOYMENT_NAME=gpt-4o
# ... other Azure settings
```

## Features

### Available in Both Modes
- ✅ Chat functionality
- ✅ Architecture recommendations
- ✅ ReactFlow diagram generation
- ✅ Azure best practices

### OpenAI Fallback Mode Specific
- ✅ Vision capabilities for image analysis
- ✅ Direct OpenAI API access
- ✅ Easier setup for development
- ✅ No Azure subscription required

### Azure Mode Specific
- ✅ Full Azure integration
- ✅ Blob storage for persistence
- ✅ Azure AI Project features
- ✅ Enterprise-grade security

## New Capabilities

### Vision Analysis

When using OpenAI fallback mode, you can analyze architecture diagrams:

```python
# Analyze an image and generate a ReactFlow diagram
response = await agent.analyze_image_with_chat(
    image_url="https://example.com/architecture-diagram.png",
    prompt="Analyze this architecture diagram and create a ReactFlow diagram"
)
```

### ReactFlow Diagram Generation

Generate interactive diagrams from natural language:

```python
# Generate a ReactFlow diagram
response = await agent.chat(
    "Create a ReactFlow diagram for a microservices architecture with API Gateway, 3 services, and a database"
)
```

## Testing

### Quick Test Script

Run the provided test script to validate your configuration:

```bash
cd backend
python test_openai.py
```

This will:
- ✅ Check configuration settings
- ✅ Test agent initialization
- ✅ Validate chat functionality
- ✅ Test ReactFlow generation
- ✅ Check vision capabilities

### Manual Testing

1. Start the backend server:
```bash
cd backend
uvicorn main:app --reload
```

2. Test the chat endpoint:
```bash
curl -X POST "http://localhost:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Help me design a web application architecture"}'
```

## API Endpoints

All existing endpoints work with both modes:

- `POST /api/chat` - Chat with the agent
- `WebSocket /ws/chat` - Streaming chat
- `GET /api/chat/history` - Chat history
- `POST /api/projects` - Project management
- `POST /api/iac/generate` - Infrastructure as Code generation

## Architecture

### OpenAI Mode Architecture

```
Frontend (React) → FastAPI → OpenAI API
                         ↓
                    Agent Framework
                         ↓
                  Azure Architect Agent
```

### Azure Mode Architecture

```
Frontend (React) → FastAPI → Azure AI Project
                         ↓
                    Agent Framework
                         ↓
                  Azure Architect Agent
                         ↓
                   Azure Services
```

## Best Practices

### Development
- Use OpenAI fallback mode for rapid development
- Test with vision capabilities using public image URLs
- Use the test script to validate configuration

### Production
- Use Azure mode for production deployments
- Configure proper Azure credentials and permissions
- Set up Azure storage for persistence

### Security
- Keep API keys secure and never commit them to source control
- Use environment variables or Azure Key Vault for secrets
- Rotate API keys regularly

## Troubleshooting

### Common Issues

**ImportError: No module named 'openai'**
```bash
pip install openai
```

**Agent not responding**
- Check OPENAI_API_KEY is set correctly
- Verify USE_OPENAI_FALLBACK=true
- Check API key has sufficient credits

**Vision capabilities not working**
- Ensure using gpt-4o or gpt-4-vision-preview model
- Verify image URL is publicly accessible
- Check image format is supported (JPEG, PNG, WebP, GIF)

**Azure credentials error**
- Make sure USE_OPENAI_FALLBACK=false for Azure mode
- Verify Azure credentials are properly configured
- Check Azure AI Project endpoint and deployment name

### Debug Mode

Enable debug logging by setting:
```bash
LOG_LEVEL=DEBUG
```

This will show detailed information about client initialization and agent responses.

## Migration

### From Azure to OpenAI (Development)
1. Set `USE_OPENAI_FALLBACK=true`
2. Add `OPENAI_API_KEY`
3. Restart the application

### From OpenAI to Azure (Production)
1. Set `USE_OPENAI_FALLBACK=false`
2. Configure Azure settings
3. Deploy with proper Azure credentials

## Support

For issues and questions:
1. Check this README
2. Run the test script for diagnostics
3. Check application logs
4. Review the error messages for specific guidance

## Examples

See the `test_openai.py` script for complete examples of:
- Agent initialization
- Chat functionality
- ReactFlow generation
- Vision analysis
- Error handling