# Technical Stack Recommendation

## Stack decision

```text
Next.js + TypeScript + Tailwind
  + Next.js server-side route handlers
  + Gemini Files API + current Flash video-capable Gemini model
  + Gemini structured JSON output + Zod validation
  + FFmpeg only for narrow evidence clips
  + seeded local demo data / cached fallback
```

This is a hackathon architecture, not a production deployment design.

## Why this stack

| Layer | Choice | Reason |
|---|---|---|
| Web app | Next.js, React, TypeScript | One codebase for the review UI and safe server-side API routes. |
| Styling | Tailwind | Fast visual iteration for a polished demo. |
| AI | Gemini video-capable Flash model | Gemini is central to the actual visual-review workflow and fits the natural sponsor/MLH direction. |
| Video input | Gemini Files API | Officially recommended for larger/reusable video files; upload once, reference across analysis calls. |
| Output shape | Structured JSON + Zod | Keeps the evidence ledger predictable; JSON validity does not prove factual accuracy. |
| Clip prep | FFmpeg | Preserves timestamps and creates short second-pass clips only when needed. |
| Persistence | Local TypeScript/JSON seed data | One demo case does not justify a database. |
| Player | Native HTML `<video>` | Reliable playback and timestamp seeking. |

## Two-pass model flow

1. **Claim extraction / eligibility:** turn report text into atomic claims and identify what video can reasonably assess.
2. **Gemini Pass 1 — claim-guided localization:** for a specific claim and the short full video, find a candidate evidence window or return `unable_to_locate`.
3. **FFmpeg (optional):** cut a narrow evidence window while preserving original timestamps.
4. **Gemini Pass 2 — narrow visual grounding:** inspect the short clip and output bounded observations, source-frame times, uncertainty, and a cautious status.
5. **Ledger/UI:** render source-linked results for human review.

Pass 2 is not independent verification. It is a narrower grounding task using the same model.

## Gemini research constraints

Official Gemini video documentation states that default static processing samples video at **1 FPS** and may miss rapid motion or quick scene changes. This is why the MVP uses a short clip chosen for slow, visible key actions.

The Files API is convenient for a demo but official documentation states uploaded files are stored for up to **48 hours**. Upload only already-public footage and delete uploaded demo files when practical.

## Do not build now

- YOLO/object detection;
- person tracking;
- pose estimation;
- VideoMAE, SlowFast, or model fusion;
- RAG/vector database;
- Supabase/database;
- authentication;
- generic event taxonomy;
- live streaming;
- production deployment/security claims.

These add failure modes and do not improve the key judge moment.