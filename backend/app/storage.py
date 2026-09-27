"""Atomic JSON publication and serialized local reads (including Windows rename retries)."""
import json
import os
import threading
import time
import uuid
from pathlib import Path

LOCK = threading.RLock()


def read(path: Path):
    with LOCK:
        for attempt in range(40):
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except PermissionError:
                if attempt == 39:
                    raise
                time.sleep(0.025)


def save(path: Path, value):
    data = value.model_dump(mode="json") if hasattr(value, "model_dump") else value
    with LOCK:
        temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temp.open("w", encoding="utf-8") as stream:
                json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
                stream.flush()
                os.fsync(stream.fileno())
            for attempt in range(40):
                try:
                    temp.replace(path)
                    return
                except PermissionError:
                    if attempt == 39:
                        raise
                    time.sleep(0.025)
        finally:
            temp.unlink(missing_ok=True)
