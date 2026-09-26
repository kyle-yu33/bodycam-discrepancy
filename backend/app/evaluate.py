"""Score a case result against its team-written ground truth.

The number that matters most is false flags: a potential_inconsistency on a claim the footage
doesn't contradict. The run fails (exit code 1) if there are any.

CLI: python -m app.evaluate sfst2 [path/to/result.json]
"""
import json
import re
import sys
from pathlib import Path

from .ledger import CaseResult, ClaimResult

SHORT = {"consistent": "consistent", "potential_inconsistency": "INCONSISTENCY",
         "insufficient_footage": "insufficient", "outside_assessment": "outside"}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s.lower())).strip()


def match(text: str, results: list[ClaimResult]) -> ClaimResult | None:
    t = norm(text)
    for r in results:
        if norm(r.claim.text) == t:
            return r
    for r in results:
        c = norm(r.claim.text)
        if c and (t in c or c in t):
            return r
    return None


def window_ok(s: float, e: float, a: float, b: float, slack: float = 2.0) -> bool:
    """At least half of the predicted window [s, e] lies inside the true window [a, b] (+/- slack).
    Merely touching isn't enough: a click has to land on the right moment."""
    inside = max(0.0, min(e, b + slack) - max(s, a - slack))
    return inside >= 0.5 * max(e - s, 0.5)


def score(res: CaseResult, gt: dict) -> dict:
    rows, used = [], set()
    for g in gt["claims"]:
        r = match(g["text"], res.results)
        got = r.status if r else None
        if r:
            used.add(r.claim.id)
        w_ok = None
        if r and g.get("window_sec") and r.window_start_sec is not None:
            w_ok = window_ok(r.window_start_sec, r.window_end_sec, *g["window_sec"])
        rows.append({"text": g["text"], "expected": g["expected"], "got": got, "planted": g.get("planted", False),
                     "window_ok": w_ok, "downgraded": bool(r and r.downgraded),
                     "observation": r.observation if r else "", "second_look": r.second_look if r else None})
    planted = [x for x in rows if x["expected"] == "potential_inconsistency"]
    return {
        "rows": rows,
        "exact": sum(x["got"] == x["expected"] for x in rows),
        # Flag or no flag is the decision that matters; insufficient vs. outside is a softer distinction.
        "flag_right": sum(x["got"] is not None and (x["got"] == "potential_inconsistency")
                          == (x["expected"] == "potential_inconsistency") for x in rows),
        "total": len(rows),
        "caught": sum(x["got"] == "potential_inconsistency" for x in planted),
        "planted": len(planted),
        "false_flags": [x for x in rows if x["got"] == "potential_inconsistency" and x["expected"] != "potential_inconsistency"],
        "unmatched": [x["text"] for x in rows if x["got"] is None],
        "extra": [r.claim.text for r in res.results if r.claim.id not in used],
        "window_misses": sum(x["window_ok"] is False for x in rows),
    }


def report(res: CaseResult, gt: dict) -> int:
    s = score(res, gt)
    print(f"\n{res.case}  model={res.model}  {res.created_at[:19]}")
    for x in s["rows"]:
        ok = "OK " if x["got"] == x["expected"] else "-- "
        got = SHORT.get(x["got"], "UNMATCHED")
        extra = (" (downgraded)" if x["downgraded"] else "") + (" [window off]" if x["window_ok"] is False else "")
        print(f"{ok}{SHORT[x['expected']]:>13} -> {got:<13}{'*' if x['planted'] else ' '} {x['text'][:70]}{extra}")
    print(f"\nexact {s['exact']}/{s['total']}  |  flag decisions {s['flag_right']}/{s['total']}  |  planted inconsistencies caught {s['caught']}/{s['planted']}"
          f"  |  FALSE FLAGS {len(s['false_flags'])}  |  windows off {s['window_misses']}")
    for x in s["false_flags"]:
        print(f"  false flag: {x['text'][:80]}\n    obs: {x['observation']}\n    2nd: {x['second_look']}")
    if s["unmatched"]:
        print("  unmatched ground-truth claims:", *s["unmatched"], sep="\n    ")
    if s["extra"]:
        print("  extra claims (not in ground truth):", *s["extra"], sep="\n    ")
    if "status" in gt:
        print(f"  note: ground truth is {gt['status'][:40]}...")
    return 1 if s["false_flags"] else 0


if __name__ == "__main__":
    from .cases import CASES, DATA
    case = sys.argv[1]
    path = Path(sys.argv[2]) if len(sys.argv) > 2 else CASES / case / "result.json"
    res = CaseResult.model_validate_json(path.read_text(encoding="utf-8"))
    gt = json.loads((DATA / "ground_truth" / f"{case}.json").read_text(encoding="utf-8"))
    sys.exit(report(res, gt))
