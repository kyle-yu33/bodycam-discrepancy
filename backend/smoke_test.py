"""One short Vertex AI call to check GOOGLE_API_KEY works. Prints status and response text only.

Run: python backend/smoke_test.py (or python smoke_test.py from backend/)
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import errors

load_dotenv(Path(__file__).resolve().parent / ".env")
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if not os.getenv("GOOGLE_API_KEY"):
    sys.exit("FAIL: GOOGLE_API_KEY is not set in backend/.env")

client = genai.Client(vertexai=True, api_key=os.environ["GOOGLE_API_KEY"])
try:
    response = client.models.generate_content(model=MODEL, contents="Reply with exactly: vertex ok")
except errors.APIError as exc:
    sys.exit(f"FAIL: {exc.code} {exc.status}: {exc.message}")
print(f"OK: {MODEL} via Vertex AI")
print(f"Response: {response.text.strip()}")
