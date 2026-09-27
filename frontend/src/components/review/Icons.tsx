// Stroke icons (Lucide geometry, ISC licence). Decorative by default; give the parent button an aria-label.
import type { ReactNode, SVGProps } from "react";

function Icon({ children, className = "h-4 w-4", ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden className={className} {...rest}>
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const PlayIcon = (p: P) => <Icon {...p}><polygon points="6 3 20 12 6 21 6 3" fill="currentColor" /></Icon>;
export const ChevronUp = (p: P) => <Icon {...p}><path d="m18 15-6-6-6 6" /></Icon>;
export const ChevronDown = (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>;
export const CloseIcon = (p: P) => <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
export const InfoIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></Icon>;
export const HelpIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></Icon>;
export const CheckIcon = (p: P) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
export const CheckCircle = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Icon>;
export const DashedCircle = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="10" strokeDasharray="3 3" /><path d="M8 12h8" /></Icon>;
export const ShieldCheck = (p: P) => (
  <Icon {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
export const FlagIcon = (p: P) => (
  <Icon {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></Icon>
);
export const PersonIcon = (p: P) => (
  <Icon {...p}><circle cx="12" cy="5" r="1" /><path d="m9 20 3-6 3 6" /><path d="m6 8 6 2 6-2" /><path d="M12 10v4" /></Icon>
);
export const EyeIcon = (p: P) => (
  <Icon {...p}><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" /><circle cx="12" cy="12" r="3" /></Icon>
);
export const FileIcon = (p: P) => (
  <Icon {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
  </Icon>
);
export const ArrowRight = (p: P) => <Icon {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></Icon>;
export const PauseIcon = (p: P) => (
  <Icon {...p}><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /></Icon>
);
export const ChevronLeft = (p: P) => <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>;
export const ChevronRight = (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>;
const SPEAKER = "M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z";
export const VolumeIcon = (p: P) => <Icon {...p}><path d={SPEAKER} /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.4 18.4a9 9 0 0 0 0-12.8" /></Icon>;
export const MuteIcon = (p: P) => <Icon {...p}><path d={SPEAKER} /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></Icon>;
export const FullscreenIcon = (p: P) => (
  <Icon {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></Icon>
);
export const PanelOpen = (p: P) => <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m14 9 3 3-3 3" /></Icon>;
export const PanelClose = (p: P) => <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="m16 15-3-3 3-3" /></Icon>;
export const UploadIcon = (p: P) => (
  <Icon {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></Icon>
);
export const VideoIcon = (p: P) => (
  <Icon {...p}><path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></Icon>
);
export const LinkIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Icon>
);
