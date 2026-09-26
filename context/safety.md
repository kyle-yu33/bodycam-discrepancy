# Safety, Privacy, and Accuracy Boundaries

## Product boundary

EvidenceLens is a review aid. It may help a human locate and inspect evidence; it must not make legal, credibility, or moral judgments.

## Never claim

- a report is false;
- an officer lied;
- a person intended an action;
- guilt or innocence;
- legal liability or reasonableness;
- that missing footage proves an event did not happen;
- that a model output is a court-ready conclusion.

## Required guardrails

1. **Source grounding:** each result needs the report wording and a timestamped evidence reference.
2. **Calibrated abstention:** unclear/partial footage must become `Insufficient footage to assess`.
3. **Claim eligibility:** subjective, legal, intent, and credibility claims must become `Outside automated assessment`.
4. **Human decision:** every result displays `Human review required`.
5. **No false certainty:** model confidence should not be portrayed as legal confidence.

## Data policy for the hackathon

- Use only real bodycam footage that an official source (police department, court, or oversight body) has already released publicly.
- Choose non-graphic clips: no serious injury, death, or sexual content.
- Cite the footage source in the app and README.
- Write the incident report as a team; do not present it as the real officers' report, and do not name real officers or civilians in it.
- Do not ingest non-public case material, sealed evidence, or personal data beyond what the public release already shows.
- Label the report clearly as team-written for the demo.

## Gemini-specific privacy constraint

The Gemini Files API is useful for demo video input, but Google’s public documentation states uploaded files are retained for a limited period (currently 48 hours). This is another reason the hackathon demo must use only already-public footage. Delete uploads when practical.

## Copy review checklist

Before a demo, README, slide, or submission is finalized:

- [ ] Does it say `review recommended`, not `contradiction proven`?
- [ ] Does it say `available footage`, not simply `the footage`?
- [ ] Does it distinguish insufficient evidence from evidence of absence?
- [ ] Does it show evidence timestamps/frames?
- [ ] Does it cite the footage source and say the report is team-written?
- [ ] Does it explain that a qualified human makes legal decisions?

## Best answer to “What if the model is wrong?”

> “The system does not make the legal conclusion. It routes the reviewer to the original evidence, shows what it relied on, and can explicitly say when the footage cannot answer the question.”