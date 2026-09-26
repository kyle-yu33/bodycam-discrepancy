# Product Definition

## Target user

The primary user is a criminal-defence lawyer, legal-aid professional, public defender, investigator, or paralegal reviewing a large set of audiovisual discovery.

The product serves their workflow; it does not replace their judgment.

## User job to be done

> When I receive an incident report and too much bodycam footage to examine closely, help me identify the factual claims that matter, find the related evidence quickly, and understand what the available footage can or cannot establish.

## Core workflow

1. A user opens a fictional report and bodycam-style video.
2. The report becomes a list of atomic claims.
3. Claims are classified as visual, audio, documentary, or subjective/legal.
4. Only appropriate visual claims receive visual-evidence review.
5. The user clicks a claim and jumps to its source video window.
6. The ledger shows observations, timestamp/frame references, uncertainty, and a cautious status.
7. The human reviewer decides what the evidence means legally.

## Atomic claim rules

Good claims are concrete and observable:

- “The individual’s hands were raised above shoulder height.”
- “The individual stepped backward after the instruction.”
- “An object was visibly present in the person’s right hand.”

Claims to route away from automated visual judgment:

- “The individual intended to flee.”
- “The individual resisted arrest.”
- “The officer acted reasonably.”
- “The witness was dishonest.”

## Claim–evidence ledger

The ledger is the central product artifact, not an incidental feature.

| Field | Requirement |
|---|---|
| Report claim | Exact original wording; do not silently rewrite it. |
| Claim category | Visual, audio, documentary, or subjective/legal. |
| Evidence window | Start/end timestamp when relevant evidence is available. |
| Source frames | Frame timestamps or thumbnails that a reviewer can inspect. |
| Visible observations | Limited to what is shown in the footage. |
| Status | One of the four approved evidence states. |
| Limitation | Why evidence is unclear or incomplete, when applicable. |
| Review control | Human review is always required. |

## Product copy

### Use

- “available footage”
- “visible evidence”
- “potential visual inconsistency — review recommended”
- “insufficient footage to assess”
- “human review required”
- “source-linked observation”

### Never use

- “AI proved the report false”
- “the officer lied”
- “contradiction proven”
- “AI verdict”
- “truth score”
- “guilt score”
- “risk score”

## The judge moment

A judge should see a report claim, click it, and immediately see the linked video moment and the reason it deserves—or cannot receive—closer review.

That is stronger than a generic chatbot answer or a generic video summary.