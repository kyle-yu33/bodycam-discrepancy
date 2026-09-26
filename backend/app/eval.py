"""Score a cached result against ground truth.

Ground truth: data/ground_truth/<name>.json
  [{"quote": "lunged at me", "expected": "contradicted"}, ...]
Usage: python -m app.eval <case_id> ..\\data\\ground_truth\\clip1.json
"""
import json
import sys
from pathlib import Path

from .pipeline import CACHE
from .schema import AnalysisResult

res = AnalysisResult.model_validate_json((CACHE / sys.argv[1] / "result.json").read_text(encoding="utf-8"))
truth = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
text = {c.id: c.text.lower() for c in res.claims}
got = {r.claim_id: r.verdict.value for r in res.results}

hits = misses = false_red = 0
for gt in truth:
    q = gt["quote"].lower()
    ids = [cid for cid, t in text.items() if q in t or t in q]
    verdicts = [got[i] for i in ids] or ["(no matching claim)"]
    ok = gt["expected"] in verdicts
    if gt["expected"] == "contradicted":
        hits, misses = hits + ok, misses + (not ok)
    elif "contradicted" in verdicts:
        false_red += 1
    print(f"{'OK  ' if ok else 'MISS'} expected={gt['expected']:13} got={','.join(verdicts):25} {gt['quote']}")
print(f"\nplanted caught {hits}/{hits + misses}   false reds: {false_red}")
