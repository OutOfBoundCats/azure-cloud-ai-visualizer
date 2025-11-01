# app/obs/tracing.py
import time, json, asyncio, uuid
from dataclasses import dataclass, asdict
from typing import Optional, Dict, Any, AsyncIterator, List

@dataclass
class TraceEvent:
    run_id: str
    step_id: str
    agent: str
    phase: str           # start|delta|end|error
    ts: float
    meta: Dict[str, Any]
    progress: Dict[str, int]
    telemetry: Dict[str, Any]
    message_delta: Optional[str] = None
    summary: Optional[str] = None
    error: Optional[str] = None

class Tracer:
    """Fan-out to multiple listeners (SSE, WebSocket, logs, OTEL)."""

    def __init__(self):
        # Each run_id fans out to zero or more subscriber queues
        self._subscribers: Dict[str, List[asyncio.Queue[Optional[str]]]] = {}

    def new_run(self) -> str:
        return f"lz-{time.strftime('%Y-%m-%d-%H%M%SZ', time.gmtime())}-{uuid.uuid4().hex[:4]}"

    def ensure_run(self, run_id: str) -> None:
        """Ensure an entry exists for the run so producers can emit before listeners attach."""
        self._subscribers.setdefault(run_id, [])

    def attach(self, run_id: str) -> asyncio.Queue[Optional[str]]:
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()
        self._subscribers.setdefault(run_id, []).append(queue)
        return queue

    def detach(self, run_id: str, queue: asyncio.Queue[Optional[str]]) -> None:
        subscribers = self._subscribers.get(run_id)
        if not subscribers:
            return
        try:
            subscribers.remove(queue)
        except ValueError:
            pass
        if not subscribers:
            self._subscribers.pop(run_id, None)

    async def emit(self, ev: TraceEvent):
        subscribers = self._subscribers.get(ev.run_id, [])
        if subscribers:
            payload = json.dumps(asdict(ev))
            for queue in list(subscribers):
                await queue.put(payload)
        # Always log too
        print("[TRACE]", ev.agent, ev.phase, ev.step_id)

    async def finish(self, run_id: str) -> None:
        """Signal all listeners that the run is complete."""
        subscribers = self._subscribers.get(run_id, [])
        for queue in list(subscribers):
            await queue.put(None)

    async def stream(self, run_id: str) -> AsyncIterator[str]:
        queue = self.attach(run_id)
        try:
            while True:
                data = await queue.get()
                if data is None:
                    break
                yield data
        finally:
            self.detach(run_id, queue)

tracer = Tracer()
