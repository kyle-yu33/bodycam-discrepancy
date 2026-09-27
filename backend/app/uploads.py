"""Bound incoming multipart bodies before FastAPI spools them to disk."""
import os
from starlette.responses import JSONResponse


class UploadLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] not in ("/cases", "/analyses"):
            return await self.app(scope, receive, send)
        # Allow report text and multipart headers in addition to the video limit.
        limit = int(os.getenv("MAX_UPLOAD_MB", "2048")) * 1024 * 1024 + 1024 * 1024
        headers = dict(scope["headers"])
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            length = 0
        response = JSONResponse({"detail": "Upload exceeds request size limit"}, status_code=413)
        if length > limit:
            return await response(scope, receive, send)
        total = 0
        exceeded = False

        async def limited_receive():
            nonlocal total, exceeded
            message = await receive()
            if message["type"] == "http.request":
                total += len(message.get("body", b""))
                if total > limit:
                    exceeded = True
                    # Let the multipart parser close its temporary files.
                    from starlette.formparsers import MultiPartException
                    raise MultiPartException("Upload exceeds request size limit")
            return message

        async def limited_send(message):
            if exceeded:
                return
            await send(message)

        await self.app(scope, limited_receive, limited_send)
        if exceeded:
            await response(scope, receive, send)
