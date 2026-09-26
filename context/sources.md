# Research Sources and Evidence Boundaries

**Research snapshot:** September 2026. Product claims below refer to publicly accessible materials, not independent performance testing or access to proprietary implementations.

## Competitor sources

| Source | What it supports |
|---|---|
| [JusticeText Product](https://www.justicetext.com/product) | Public claims on audio/video evidence review, searchable transcripts, MirandaAI, timelines, inconsistencies, PDF support, document/video cross-reference, file formats, and confidence indicators for difficult audio. |
| [JusticeText Homepage](https://www.justicetext.com/) | Public emphasis on time-stamped transcripts, case timelines, inconsistencies, key moments, and courtroom preparation. |
| [JusticeText Case Studies](https://www.justicetext.com/case-studies) | Public examples of defence teams using audiovisual evidence workflows. |
| [JusticeText How-To](https://www.justicetext.com/how-to) | Public feature index: MirandaAI, PDF analysis, video clips, presentation, file sharing, syncing, transcript-related workflows. |
| [Reduct — AI Tools for Public Defenders](https://reduct.video/blog/ai-tools-for-public-defenders/) | Defence-side video-evidence review problem and adjacent workflow context. |
| [Axon Evidence](https://www.axon.com/products/axon-evidence) | Evidence-management infrastructure context. |
| [VIDIZMO DEMS](https://www.vidizmo.com/digital-evidence-management-system/) | Digital evidence management, discovery, and auditability context. |
| [CaseGuard](https://caseguard.com/) | Redaction/transcription/evidence processing context. |

## JusticeText conclusion

Public JusticeText materials clearly document bodycam/audiovisual evidence review and strongly emphasize transcription, transcript search, documents, timelines, clips, and cross-referencing. They do **not publicly specify** frame-level computer-vision functions such as action recognition, object detection, pose estimation, or physical-claim verification.

Correct wording:

> “We found no public documentation that JusticeText uses vision AI for frame-level verification of physical claims.”

Incorrect wording:

> “JusticeText does not use vision AI.”

## Gemini official documentation

| Source | Build-relevant finding |
|---|---|
| [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding) | Gemini accepts video input; default static processing extracts frames at 1 FPS; the docs warn this can miss rapid motion/quick changes; Files API is recommended for larger/reusable video inputs; prompts can request visual/audio details and timestamps. |
| [Gemini Files API](https://ai.google.dev/gemini-api/docs/files) | Files may be stored for up to 48 hours. **Not used:** the project runs on Vertex AI, where the Files API is unavailable, so clips are sent inline instead. |
| [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) | Gemini supports JSON Schema/structured output; documentation warns teams to handle schema-compliant but semantically incorrect outputs. |
| [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) | Limits are measured across RPM, TPM, and RPD; test the actual team project before relying on live calls. |

## Model-reliability context

| Source | Relevance |
|---|---|
| [VideoHallucer, arXiv:2406.16338](https://arxiv.org/abs/2406.16338) | Benchmark on hallucinations in large video-language models. |
| [CounterVid, arXiv:2601.04778](https://arxiv.org/abs/2601.04778) | Describes action and temporal hallucination concerns in video-language models. |
| [BodyCam-VQA, arXiv:2609.10815](https://arxiv.org/abs/2609.10815) | Research context for body-worn-camera challenges: chaotic scenes, movement, low quality, noisy audio, and forensic detail. |

## Research-bound conclusions

1. The user pain is real and validated by existing legal-tech products.
2. Existing tools weaken broad novelty claims but do not eliminate the potential claim-ledger/visual-review wedge.
3. Current model output should be treated as a source-linked review aid, never an autonomous legal conclusion.
4. This hackathon prototype must use only publicly released footage and present calibrated uncertainty honestly.
