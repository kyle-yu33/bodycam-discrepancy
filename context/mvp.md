# Hackathon MVP Scope

## Goal

Demonstrate one dependable evidence-first review flow. A polished happy path and one credible abstention case are more valuable than broad feature coverage.

## The case

Use one **staged, fully fictional, non-graphic, consented bodycam-style video** that lasts approximately 45–90 seconds.

Pair it with one fictional incident report containing 5–7 report claims.

### Required claim mix

| Claim type | Required result |
|---|---|
| Concrete visible claim | Consistent with visible evidence |
| Concrete visible claim | Potential visual inconsistency — review recommended |
| Concrete but unclear claim | Insufficient footage to assess |
| Audio-only claim | Clearly identified as not a visual judgment |
| Subjective/legal/intent claim | Outside automated assessment |

Design the staged video so the key visual action is well lit, framed, and visible for roughly 2–4 seconds. Do not depend on a split-second gesture, tiny distant object, rapid camera motion, or a complex altercation.

## In scope

- fictional report viewer;
- claim list with categories and statuses;
- video player that seeks to claim timestamps;
- source-frame thumbnails/placeholders;
- selected claim evidence ledger;
- `Analyze case` loading flow with deterministic demo result;
- explicit mock/cached-analysis label if results are not live;
- visible human-review and fictional-data disclaimer.

## Out of scope

- real evidence uploads;
- arbitrary reports or long video processing;
- user accounts, authentication, or collaboration;
- database, vector search, or broad evidence management;
- multi-camera synchronization;
- custom model training or multiple CV models;
- court-ready exports;
- legal advice or determinations.

## Acceptance criteria

- [ ] The app renders without an API key.
- [ ] A judge can select every seeded claim.
- [ ] Selecting a claim updates the ledger and seeks/highlights the relevant video moment.
- [ ] All four approved evidence states are visible.
- [ ] The app makes no unsafe truth, lie, guilt, intent, or liability claim.
- [ ] The staged case is visibly labeled fictional.
- [ ] A fallback works if Gemini, Wi-Fi, or upload processing fails.

## Demo fallback

The primary demo may use precomputed/cached results for the known fictional case. That is acceptable only if labeled honestly, for example:

> “Demo analysis loaded for this fictional case.”

A live re-analysis button may exist, but it must never be the only path to the judge moment.