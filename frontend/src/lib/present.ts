// Display rules for the review workspace. Wording follows context/frontend.md and context/safety.md:
// never "lie", "false", "verdict", "guilt", "proven", and never red.
import type { ClaimResult, ClaimType, PoseEvent, Status } from "./ledger";

export const STATUS_ORDER: Status[] = ["potential_inconsistency", "consistent", "insufficient_footage", "outside_assessment"];

// Full class strings (not built dynamically) so Tailwind can see them. Only "review" is saturated.
export const STATUS: Record<Status, {
  label: string; short: string; badge: string; dot: string; text: string; tint: string;
  mark: string; markSelected: string; bar: string; why: string;
}> = {
  potential_inconsistency: {
    label: "Potential inconsistency — review recommended",
    short: "Review recommended",
    badge: "bg-review-bg text-review ring-review/25",
    dot: "bg-review-bar",
    text: "text-review",
    tint: "bg-review-bg",
    mark: "bg-review-mark/80 hover:bg-review-mark",
    markSelected: "bg-review-mark shadow-[inset_0_-2px_0_var(--color-review-bar)]",
    bar: "bg-review-bar",
    why: "In this window the footage appears incompatible with the claim, and an independent re-check on a clean clip agreed. A person should review this moment. It is not a finding that the report is inaccurate.",
  },
  consistent: {
    label: "Consistent with visible evidence",
    short: "Consistent",
    badge: "bg-consistent-bg text-consistent ring-consistent/20",
    dot: "bg-consistent-bar",
    text: "text-consistent",
    tint: "bg-consistent-bg",
    mark: "underline decoration-dotted decoration-ink/20 underline-offset-[5px] hover:bg-hairline",
    markSelected: "bg-brand-soft underline decoration-brass decoration-2 underline-offset-[5px]",
    bar: "bg-consistent-bar",
    why: "The footage visibly or audibly matches this claim. That does not confirm every detail of the report.",
  },
  insufficient_footage: {
    label: "Insufficient footage to assess",
    short: "Insufficient footage",
    badge: "bg-insufficient-bg text-insufficient ring-insufficient/20",
    dot: "bg-insufficient-bar",
    text: "text-insufficient",
    tint: "bg-insufficient-bg",
    mark: "underline decoration-dotted decoration-ink/20 underline-offset-[5px] hover:bg-hairline",
    markSelected: "bg-brand-soft underline decoration-brass decoration-2 underline-offset-[5px]",
    bar: "bg-insufficient-bar",
    why: "The footage can't establish this: the moment is off-camera, obscured, too far away or too small to resolve. That is not evidence it didn't happen.",
  },
  outside_assessment: {
    label: "Outside automated assessment",
    short: "Outside assessment",
    badge: "bg-outside-bg text-outside ring-outside/20",
    dot: "bg-outside-bar",
    text: "text-outside",
    tint: "bg-outside-bg",
    mark: "underline decoration-dotted decoration-ink/20 underline-offset-[5px] hover:bg-hairline",
    markSelected: "bg-brand-soft underline decoration-brass decoration-2 underline-offset-[5px]",
    bar: "bg-outside-bar",
    why: "This is an opinion, a sensation, or a legal conclusion. Automated review deliberately doesn't assess it; that is the correct boundary for this tool.",
  },
};

export const CLAIM_TYPE: Record<ClaimType, string> = {
  visual: "Visual",
  audio: "Audio",
  documentary: "Documentary",
  subjective_or_legal: "Opinion or legal",
};

/** 75.3 -> "1:15.3" */
export function clock(t: number, decimals = 1): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, "0")}`;
}

export function windowLabel(r: ClaimResult): string | null {
  if (r.window_start_sec == null || r.window_end_sec == null) return null;
  return `${clock(r.window_start_sec)} – ${clock(r.window_end_sec)}`;
}

// ---------- Cases ----------

export const CASE_META: Record<string, { title: string; setting: string; camera: string; source: string; sourceUrl: string }> = {
  sfst1: {
    title: "Walk-and-turn test",
    setting: "Night · parking lot",
    camera: "Axon Body 2",
    source: "Publicly released body-worn camera footage (YouTube 4ThCZOa20wc, 3:40–5:00)",
    sourceUrl: "https://www.youtube.com/watch?v=4ThCZOa20wc&t=220s",
  },
  sfst2: {
    title: "Finger-to-nose test",
    setting: "Station garage",
    camera: "Axon Body 3",
    source: "Publicly released body-worn camera footage (YouTube mXw1nvF3klk, 15:20–16:20)",
    sourceUrl: "https://www.youtube.com/watch?v=mXw1nvF3klk&t=920s",
  },
  gunpoint: {
    title: "Weapons call response",
    setting: "Day · townhouse parking lot",
    camera: "Axon Body 3",
    source: "Body-worn camera footage re-published by Audit the Audit (YouTube yOegqWf4pM4, 0:48–1:10)",
    sourceUrl: "https://www.youtube.com/watch?v=yOegqWf4pM4&t=48s",
  },
  porch: {
    title: "Porch identification stop",
    setting: "Night · front porch",
    camera: "Axon Body 3",
    source: "Body-worn camera footage re-published by Audit the Audit (YouTube LPFw5-sIImk, 7:40–8:25)",
    sourceUrl: "https://www.youtube.com/watch?v=LPFw5-sIImk&t=460s",
  },
  hospital: {
    title: "Hospital welfare check",
    setting: "Indoor · hospital lounge",
    camera: "Axon Body 3",
    source: "Body-worn camera footage re-published by Audit the Audit (YouTube qKlP-zdpj48, 4:13–5:00)",
    sourceUrl: "https://www.youtube.com/watch?v=qKlP-zdpj48&t=253s",
  },
  parkedcar: {
    title: "Parked-car contact",
    setting: "Night · roadside",
    camera: "Axon Body 4",
    source: "Body-worn camera footage re-published by Audit the Audit (YouTube G19anoWa2LA, 1:30–3:05)",
    sourceUrl: "https://www.youtube.com/watch?v=G19anoWa2LA&t=90s",
  },
};

export const caseMeta = (id: string) =>
  CASE_META[id] ?? { title: id, setting: "", camera: "", source: "Publicly released body-worn camera footage", sourceUrl: "" };

// Demo cases, strongest first; lists show examples in this order, and "See an example" opens the first.
export const EXAMPLE_ORDER = ["porch", "hospital", "sfst1", "sfst2", "gunpoint"];
export const exampleRank = (id: string) => {
  const i = EXAMPLE_ORDER.indexOf(id);
  return i < 0 ? EXAMPLE_ORDER.length : i;
};

// ---------- Report ----------

export interface ParsedReport {
  disclaimer: string;
  fields: [string, string][];
  narrative: string;
}

/** Splits our report format: a FICTIONAL disclaimer, "Key: value" header lines, a NARRATIVE heading, the narrative. */
export function parseReport(text: string): ParsedReport {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().toUpperCase() === "NARRATIVE");
  let disclaimer = "";
  const fields: [string, string][] = [];
  for (const line of at >= 0 ? lines.slice(0, at) : []) {
    const t = line.trim();
    if (!t) continue;
    if (/^FICTIONAL/i.test(t)) disclaimer = t;
    else {
      const m = t.match(/^([^:]{2,40}):\s*(.+)$/);
      if (m) fields.push([m[1], m[2]]);
    }
  }
  const narrative = (at >= 0 ? lines.slice(at + 1).join("\n") : text).trim();
  return { disclaimer, fields, narrative };
}

export interface Segment {
  text: string;
  result?: ClaimResult;
  n?: number; // 1-based claim number
}

/** Narrative split into plain text and claim spans (claims quote the report exactly). */
export function segment(narrative: string, results: ClaimResult[]): Segment[] {
  const spans: { start: number; end: number; result: ClaimResult; n: number }[] = [];
  const lower = narrative.toLowerCase();
  let from = 0;
  results.forEach((result, idx) => {
    const needle = result.claim.text.trim();
    let i = narrative.indexOf(needle, from);
    if (i < 0) i = lower.indexOf(needle.toLowerCase());
    if (i < 0) return;
    spans.push({ start: i, end: i + needle.length, result, n: idx + 1 });
    from = i + needle.length;
  });
  spans.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue; // overlapping match: keep the first
    if (s.start > pos) out.push({ text: narrative.slice(pos, s.start) });
    out.push({ text: narrative.slice(s.start, s.end), result: s.result, n: s.n });
    pos = s.end;
  }
  if (pos < narrative.length) out.push({ text: narrative.slice(pos) });
  return out;
}

// ---------- Pose ----------

const POSE_LABEL: Record<string, string> = {
  arms_at_sides: "Arms at sides",
  left_arm_out: "Left arm out from body",
  right_arm_out: "Right arm out from body",
  hands_raised: "Hands raised",
  left_hand_to_face: "Left hand to face",
  right_hand_to_face: "Right hand to face",
  head_tilted: "Head tilted",
  foot_raised: "Foot raised",
  swaying: "Swaying",
  lying_down: "Lying down",
};

export interface PoseGroup {
  label: string;
  times: { start: number; end: number }[];
}

/** Person pose events grouped by kind, in order of first appearance. Camera events and track IDs are not shown. */
export function poseGroups(events: PoseEvent[]): PoseGroup[] {
  const groups = new Map<string, PoseGroup>();
  for (const e of [...events].sort((a, b) => a.start_sec - b.start_sec)) {
    if (e.track_id < 0 || !POSE_LABEL[e.event]) continue;
    const g = groups.get(e.event) ?? { label: POSE_LABEL[e.event], times: [] };
    g.times.push({ start: e.start_sec, end: e.end_sec });
    groups.set(e.event, g);
  }
  return [...groups.values()];
}
