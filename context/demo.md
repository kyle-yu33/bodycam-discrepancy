# Demo, Pitch, README, and Submission Direction

## Primary story

> Defence teams do not need another chatbot. They need a faster, more transparent way to find the few minutes of video that deserve close attention.

## 90-second demo flow

1. **Problem (10 seconds):** “A single case can include hours of bodycam footage and a written report. Defence teams cannot review every minute equally.”
2. **Case (10 seconds):** Open the report and the real bodycam clip, with its public source shown.
3. **Claims (15 seconds):** Show the report decomposed into concrete claims; call out that subjective/legal claims are intentionally not automated.
4. **Judge moment (25 seconds):** Select a review-worthy claim. The player jumps to the linked evidence window; show the exact report wording, source frames, and careful status.
5. **Trust moment (15 seconds):** Select an unclear claim and show `Insufficient footage to assess`. Explain that a responsible tool does not guess.
6. **Close (15 seconds):** “As vision AI improves, evidence review can improve too. But the source trail, uncertainty, and human legal judgment remain non-negotiable.”

## Pitch framing

### Say

- “evidence-first claim review”
- “source-linked visual review questions”
- “defence-side discovery triage”
- “human-supervised evidence workflow”
- “explicit uncertainty”

### Avoid

- “AI exposes police lies”
- “AI proves reports wrong”
- “we replace evidence review”
- “we are the first tool to compare reports and video”
- “JusticeText does not use vision AI”

## Demo reliability

- Use one known clip with a team-written report, so expected results are known.
- Make the key visual action visible long enough to inspect.
- Precompute/cache the expected result and label it honestly.
- Have a screen-recorded fallback or a known static state if the live API fails.
- Never rely on venue Wi-Fi or a first-time API call for the key reveal.

## README outline

1. Problem
2. Solution
3. How the demo works (public footage, team-written report)
4. Why human review and uncertainty matter
5. Stack and architecture
6. Setup instructions
7. Demo path
8. Limitations and ethical boundaries
9. Credits and external assets

## Submission checklist

- [ ] Core demo works from a clean start.
- [ ] No API key or sensitive data is committed.
- [ ] README has setup and demo instructions.
- [ ] Fallback path is rehearsed.
- [ ] Footage is publicly released, non-graphic, and source-cited; the report is labeled team-written.
- [ ] Sponsor/API claims are accurate.
- [ ] JusticeText comparison uses the source-bounded wording in `positioning.md`.
- [ ] Submission deadline, links, tracks, and credit requirements are checked from official event channels.