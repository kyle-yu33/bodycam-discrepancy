# Frontend and UX Specification

## Product surface

Build a calm, evidence-review workspace. The page should feel like a legal review tool, not a police dashboard, threat detector, or surveillance control room.

## Primary layout

### Header

- `evidently` name/logo;
- badge: `Demo case: public footage, team-written report`;
- trust label: `Human review required`;
- `Analyze case` button;
- analysis state: `Ready`, `Analyzing`, `Demo result loaded`, or `Analysis failed`.

### Left panel — Report Claims

- compact report narrative;
- 5–7 atomic claim cards;
- claim number and exact wording;
- category: Visual / Audio / Documentary / Outside automated assessment;
- current evidence-state badge;
- selected state;
- click selects claim and seeks the video when a window exists.

### Center panel — Evidence Viewer

- native video player or graceful placeholder when `public/demo-bodycam.mp4` is absent;
- highlighted evidence windows on a timeline;
- selected start/end timestamp;
- source-frame cards or placeholders;
- short `Visible observations` section;
- source/evidence disclaimer.

### Right panel — Claim–Evidence Ledger

Show the selected claim with:

1. original report wording;
2. evidence window;
3. visible observations;
4. cautious evidence status;
5. why it was flagged or why evidence is insufficient;
6. source-frame times;
7. `Human review required`.

## Status visual system

| Status | Color | UX rule |
|---|---|---|
| Consistent with visible evidence | Green | Do not imply completeness or legal correctness. |
| Potential visual inconsistency — review recommended | Amber | Never use alarming red or “proven contradiction.” |
| Insufficient footage to assess | Slate/neutral | Make uncertainty understandable, not hidden. |
| Outside automated assessment | Purple/neutral | Show that abstention is correct behavior. |

## Interaction rules

- Clicking a claim updates all panels.
- If the selected claim has a video window, seek the player to its start time.
- If no window exists, show a clear unavailable/abstention state.
- `Analyze case` shows a loading state and then returns deterministic demo results.
- A failed analysis shows a retry action and retains the cached demo path.
- Add a compact “How this demo works” drawer: claims → localization → grounding → ledger → human review.

## Accessibility and tone

- Keyboard-accessible claim selection and controls.
- Clear contrast and readable timestamp formatting.
- Avoid jargon where a lawyer/judge does not need it.
- No facial-recognition cards, person tracking IDs, danger indicators, risk scores, or police-style event feed.
- Responsive behavior: stack panels on narrow displays while preserving claim selection and evidence review.

## Required copy

Use:

> “This prototype surfaces source-linked review questions. It does not make legal conclusions.”

Never show `lie`, `false`, `verdict`, `guilt`, `risk score`, or `contradiction proven`.