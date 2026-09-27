# Application Skeleton and Build Order

## Goal

Build a dependable, attractive local demo skeleton before attempting live video/model integration.

## Suggested structure

```text
app/
  page.tsx
  api/analyze/route.ts
components/
  case-header.tsx
  claim-list.tsx
  claim-card.tsx
  evidence-viewer.tsx
  evidence-ledger.tsx
  analysis-workflow.tsx
  status-badge.tsx
lib/
  types.ts
  demo-case.ts
  analysis/
    analyze-case.ts
    mock-analyzer.ts
    gemini-analyzer.ts
    video-preparation.ts
public/
  demo-bodycam.mp4        # optional; UI must survive if absent
```

Adapt to the existing repository instead of forcing this exact layout.

## Build order

### 1. Seed the domain model

Create one demo case (public clip + team-written report) with report text, 5–7 claims, evidence windows, source-frame times, and all approved status categories.

### 2. Build the static three-panel review page

Claims left, video/timeline center, ledger right. Clicking a claim must update the selected state before any AI work is added.

### 3. Add the analysis service boundary

Create `analyzeCase()` and a deterministic `mockAnalyzer`. Make `Analyze case` show a short loading state and populate the same UI data model.

### 4. Add safe states

Implement no-video, no-window, loading, analysis-error, and cached-demo-result states.

### 5. Add future seams

Create clearly marked Gemini and FFmpeg adapters, but do not require API keys or binaries for the skeleton to run.

### 6. Verify

Run the repository’s available lint, typecheck, test, and production-build commands. Do not call the skeleton complete until it renders locally and those commands produce real output.

## Minimum demo result

A judge can:

1. open the demo case;
2. click a report claim;
3. see the video seek/highlight the relevant window;
4. inspect the evidence ledger;
5. see an abstention result where footage cannot answer the claim.

## Existing Claude Code prompt

`/Users/lucasliu/Desktop/Claude_Code_Prompt_evidently_Skeleton.md` contains a detailed implementation prompt based on this document set. It instructs Claude Code to build the working skeleton and run verification.