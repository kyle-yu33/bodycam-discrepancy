"""Cooperative cancellation shared by the video, model, and transcription stages."""
from contextvars import ContextVar
from dataclasses import dataclass, field
from threading import Event
import time


class Cancelled(Exception):
    pass


@dataclass
class Control:
    cancel: Event = field(default_factory=Event)
    deadline: float = float("inf")

    def check(self):
        if self.cancel.is_set():
            raise Cancelled("Stopped by reviewer")
        if time.monotonic() >= self.deadline:
            raise TimeoutError("Analysis exceeded its time limit")


current = ContextVar("analysis_control", default=None)


def check():
    control = current.get()
    if control is not None:
        control.check()


def pause(seconds):
    control = current.get()
    if control is None:
        time.sleep(seconds)
    else:
        control.cancel.wait(seconds)
        control.check()
