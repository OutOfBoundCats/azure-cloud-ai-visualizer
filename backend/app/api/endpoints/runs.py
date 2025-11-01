# app/api/endpoints/runs.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.obs.tracing import tracer

router = APIRouter()

@router.get("/runs/{run_id}/events")
async def stream_run(run_id: str):
    async def event_source():
        async for item in tracer.stream(run_id):
            yield f"data: {item}\n\n"   # SSE format
    return StreamingResponse(event_source(), media_type="text/event-stream")
