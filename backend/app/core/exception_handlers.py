import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    # Starlette's ServerErrorMiddleware (which invokes this handler for
    # unhandled exceptions) sits OUTSIDE CORSMiddleware, so responses built
    # here never pass back through it — the browser sees a bare 500 with no
    # Access-Control-Allow-Origin header and reports it as a CORS failure,
    # masking the real error. Add the header manually so cross-origin
    # frontends (e.g. the separate Render static site) can actually read it.
    origin = request.headers.get("origin")
    if origin in settings.cors_allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    return response
