# EvidenceLens — Canonical Project Brief

**Hackathon:** Hack the Hill III · **Primary fit:** Civic Tech · **Team:** Artem, Lucas, Ayan, Kyle

## One-sentence solution

**EvidenceLens turns a written incident narrative and bodycam-style footage into a claim-by-claim evidence map, helping defence-side legal teams find the moments that deserve close human review.**

## The problem

Criminal-defence and legal-aid teams can receive hours of body-worn-camera footage alongside incident reports and other discovery. They do not have enough time to review every minute with equal care. The critical question is often not “what is in the video?” but:

> **Which statements in the written narrative should a lawyer inspect against the underlying evidence first?**

## The product

EvidenceLens reads a report, identifies atomic claims, determines which claims are visually assessable, links them to the relevant video window, and produces a transparent **claim–evidence ledger**.

Each ledger item contains:

- the exact report wording;
- a claim category and eligibility decision;
- a timestamped evidence window;
- source-frame times;
- bounded visible observations;
- a cautious review status;
- an explicit requirement for human review.

## What it is / is not

| EvidenceLens is | EvidenceLens is not |
|---|---|
| A defence-side evidence-review copilot | A police lie detector |
| A way to prioritize lawyer attention | A system that decides guilt or legal liability |
| A claim-first, evidence-linked workflow | A generic surveillance event detector |
| A visual-review layer for concrete physical claims | A credibility, intent, or misconduct classifier |
| A fictional hackathon prototype | A production-ready legal platform |

## Evidence states

| Status | Meaning |
|---|---|
| **Consistent with visible evidence** | Available footage visibly aligns with a concrete claim. |
| **Potential visual inconsistency — review recommended** | Available footage warrants closer human review against a concrete claim. |
| **Insufficient footage to assess** | The camera angle, obstruction, darkness, incomplete footage, or ambiguity prevents a sound assessment. |
| **Outside automated assessment** | The claim is subjective, legal, about intent/credibility, or otherwise not appropriate for automated visual assessment. |

Absence from footage is **not** proof that an event did not happen.

## Differentiation

Existing legal-tech products validate the problem. JusticeText publicly supports bodycam review, searchable transcripts, document analysis, timeline creation, cross-referencing, and AI-assisted inconsistency work. EvidenceLens must not claim it invented AI report/video comparison.

The focused wedge is:

> **A claim-first, visually grounded, source-linked review ledger that makes uncertainty explicit.**

Public JusticeText materials emphasize transcription, transcript search, document analysis, timelines, and evidence cross-referencing. We found **no public documentation** that it uses vision AI for frame-level verification of physical claims. This is a public-documentation finding, not proof of JusticeText’s internal implementation.

## Hackathon MVP

Build one polished end-to-end case only:

- one staged, fictional, non-graphic 45–90 second bodycam-style video;
- one fictional report with 5–7 claims;
- one claim consistent with visible evidence;
- one claim that merits close human review;
- one claim with insufficient visual evidence;
- one audio-only or subjective/legal claim the system refuses to judge;
- report claims, player timestamp jump, source frames, and evidence ledger UI;
- cached/demo analysis fallback.

## Architecture decision

```text
Report + staged video
  → claim extraction / eligibility
  → Gemini Pass 1: claim-guided evidence localization
  → short evidence window
  → Gemini Pass 2: narrow visual grounding
  → claim–evidence ledger
  → attorney review UI
```

The report drives the review. Do **not** begin with generic detection of “fight,” “lunge,” “weapon,” or tracked people.

## Core principle

> **No claim without a source. No source without a timestamp. No certainty when footage is unclear.**

Read the other files in this folder before expanding scope.