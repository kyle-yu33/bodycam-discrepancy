// Fine-line illustrations for the home page. Strokes use currentColor (set the colour on the <svg>). Every stroke
// meant to draw itself in has pathLength={1} (see .el-draw in globals.css); dashed or filled details don't, and
// simply fade in with their section. Amber marks only the "moment that matters", as it does in the workspace.
import type { CSSProperties } from "react";

const D = { pathLength: 1 } as const;
const stage = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// COCO-17 keypoints (the subject's left/right), posed with the right arm out.
const KP: Record<string, [number, number]> = {
  nose: [120, 44], leye: [124, 40], reye: [116, 40], lear: [130, 43], rear: [110, 43],
  lsh: [142, 68], rsh: [98, 68], lel: [156, 96], rel: [74, 74], lwr: [162, 122], rwr: [50, 70],
  lhip: [134, 124], rhip: [106, 124], lkn: [138, 158], rkn: [104, 158], lank: [142, 190], rank: [100, 190],
};
// The body's bones; the face keypoints are drawn as dots only (their bones read as a squiggle at this size).
const BONES = [
  ["lsh", "rsh"], ["lsh", "lel"], ["lel", "lwr"],
  ["rsh", "rel"], ["rel", "rwr"], ["lsh", "lhip"], ["rsh", "rhip"], ["lhip", "rhip"], ["lhip", "lkn"], ["lkn", "lank"],
  ["rhip", "rkn"], ["rkn", "rank"],
];
const LIMBS = [["rwr", "rel", "rsh"], ["lwr", "lel", "lsh"], ["lank", "lkn", "lhip"], ["rank", "rkn", "rhip"]];
const pt = (k: string) => KP[k].join(" ");
const FACE = new Set(["nose", "leye", "reye", "lear", "rear"]);

/** A person with the pose model's 17-keypoint skeleton, drawn like the overlay in the review workspace. */
export function PoseIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" fill="none" strokeLinecap="round" strokeLinejoin="round" className={`el-draw ${className}`} aria-hidden>
      <g stroke="currentColor" strokeOpacity={0.07} strokeWidth={15}>
        {LIMBS.map((l) => <path key={l[0]} d={`M${l.map(pt).join(" L")}`} />)}
      </g>
      <path d={`M${pt("rsh")} L${pt("lsh")} L${pt("lhip")} L${pt("rhip")} Z`} fill="currentColor" fillOpacity={0.06} />
      <circle cx="120" cy="44" r="15" fill="currentColor" fillOpacity={0.06} />
      <rect x="38" y="22" width="140" height="176" rx="2" stroke="currentColor" strokeOpacity={0.28} strokeDasharray="3 4" />
      <text x="38" y="15" className="fill-brass font-mono" fontSize="9">id:1</text>
      <text x="62" y="15" className="fill-muted font-mono" fontSize="9">right_arm_out</text>
      <g className="stroke-brass" strokeWidth={1.4} style={stage(300)}>
        {BONES.map(([a, b]) => <path key={a + b} d={`M${pt(a)} L${pt(b)}`} {...D} />)}
      </g>
      {Object.entries(KP).map(([k, [x, y]]) => <circle key={k} cx={x} cy={y} r={FACE.has(k) ? 1.5 : 2.4} className="fill-ink" />)}
      <text x="196" y="196" className="fill-muted font-mono" fontSize="9">t=12.3s</text>
    </svg>
  );
}

/** A filmstrip over its audio, with one claim's time window bracketed. */
export function FootageIllustration({ className = "" }: { className?: string }) {
  const frames = [16, 60, 104, 148, 192];
  const wave = Array.from({ length: 57 }, (_, i) => {
    const x = 8 + i * 4;
    const loud = x > 58 && x < 184 ? 1 : 0.45;
    return `${x} ${(140 + Math.sin(i * 1.7) * (3 + 13 * Math.abs(Math.sin(x * 0.05)) * loud)).toFixed(1)}`;
  });
  const ticks = Array.from({ length: 29 }, (_, i) => `M${8 + i * 8} 170 V176`).join(" ");
  return (
    <svg viewBox="0 0 240 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={`el-draw ${className}`} aria-hidden>
      <text x="8" y="26" className="fill-muted font-mono" fontSize="8" letterSpacing="1.5" stroke="none">VIDEO</text>
      <rect x="8" y="34" width="224" height="46" rx="3" strokeOpacity={0.35} {...D} />
      <path d="M12 38.5 H228 M12 75.5 H228" strokeOpacity={0.22} strokeWidth={2.5} strokeDasharray="2.5 5.5" strokeLinecap="butt" />
      {frames.map((f, i) => (
        <g key={f} style={stage(150 * i)}>
          <rect x={f} y="44" width="34" height="26" rx="1.5" strokeOpacity={0.6} {...D} />
          <path d={`M${f + 2} 64 H${f + 32}`} strokeOpacity={0.25} {...D} />
          <circle cx={f + 9 + i * 4} cy="53" r="2.4" strokeOpacity={0.6} {...D} />
          <path d={`M${f + 9 + i * 4} 56 V63`} strokeOpacity={0.6} {...D} />
        </g>
      ))}
      <g className="stroke-review-bar" strokeWidth={1.6} style={stage(1300)}>
        <path d="M58 86 V91 H184 V86" {...D} />
      </g>
      <text x="121" y="104" textAnchor="middle" className="fill-review font-mono" fontSize="8.5" stroke="none">0:31.9 – 0:44.5</text>
      <text x="8" y="120" className="fill-muted font-mono" fontSize="8" letterSpacing="1.5" stroke="none">AUDIO</text>
      <path d={`M${wave.join(" L")}`} strokeOpacity={0.55} strokeWidth={1.2} style={stage(600)} {...D} />
      <path d={ticks} strokeOpacity={0.3} style={stage(900)} {...D} />
      <text x="232" y="192" textAnchor="end" className="fill-muted font-mono" fontSize="8" letterSpacing="1.5" stroke="none">2 FPS</text>
    </svg>
  );
}

/** A flagged window lifted out of the recording and looked at again, clean, before it is shown. */
export function RecheckIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 200" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={`el-draw ${className}`} aria-hidden>
      <rect x="12" y="24" width="216" height="10" rx="5" strokeOpacity={0.4} {...D} />
      <rect x="120" y="24" width="34" height="10" rx="2" className="stroke-review-bar fill-review-bar/20" {...D} />
      <path d="M120 34 L66 78 M154 34 L174 78" strokeOpacity={0.3} style={stage(500)} {...D} />
      <g style={stage(800)}>
        <rect x="62" y="78" width="116" height="84" rx="6" strokeOpacity={0.6} className="fill-canvas" {...D} />
        <rect x="72" y="88" width="96" height="50" rx="2" strokeOpacity={0.35} {...D} />
        <circle cx="120" cy="104" r="5" strokeOpacity={0.7} {...D} />
        <path d="M120 109 V124 M120 114 L110 120 M120 114 L130 108 M120 124 L114 134 M120 124 L126 134" strokeOpacity={0.7} {...D} />
      </g>
      <text x="72" y="153" className="fill-muted font-mono" fontSize="8" stroke="none">clean clip · 5 fps</text>
      <g className="stroke-consistent" strokeWidth={1.6} style={stage(1600)}>
        <circle cx="178" cy="162" r="11" className="fill-canvas" {...D} />
        <path d="M172.5 162 L176.5 166 L183.5 158" {...D} />
      </g>
    </svg>
  );
}

/** Drifting smoke behind the "Under the hood" section, in the ivory of the hero's watercolour cloud: fractal
 *  noise thresholded into soft billows, feathered at the edges so it dissolves into the page. */
export function CloudBackdrop() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.26]
      [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,black_30%,transparent_100%)]">
      <filter id="el-cloud" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.006" numOctaves="4" seed="11" />
        {/* Ivory smoke; alpha from the noise, lifted so only its brighter half shows. */}
        <feColorMatrix values="0 0 0 0 0.95  0 0 0 0 0.91  0 0 0 0 0.86  2.6 0 0 0 -1.05" />
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <rect width="100%" height="100%" filter="url(#el-cloud)" />
    </svg>
  );
}
