import Image from "next/image";

// Faint black-and-white photos in the side margins of the new-case page (public/new/, toned to the page and
// feathered to transparent). Fixed behind the content, wide screens only; a dark wash keeps the form column clean.
const PHOTOS = [
  // Real officers: kept blurred and faint so no one is identifiable.
  { src: "/new/police.png", w: 804, h: 1008, className: "-left-[4vw] top-[2vh] w-[23vw] opacity-25 blur-[2px]" },
  { src: "/new/books.png", w: 619, h: 1100, className: "-bottom-[16vh] -left-[3vw] w-[22vw] opacity-40" },
  { src: "/new/car.png", w: 1100, h: 733, className: "-right-[7vw] top-[6vh] w-[36vw] opacity-40" },
  { src: "/new/gavel.png", w: 736, h: 981, className: "bottom-0 -right-[4vw] w-[26vw] opacity-45 blur-[1px]" },
];

export function UploadBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden lg:block">
      {PHOTOS.map((p) => (
        <Image key={p.src} src={p.src} alt="" width={p.w} height={p.h} sizes="36vw" className={`absolute h-auto select-none ${p.className}`} />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_42%_75%_at_50%_45%,var(--color-canvas)_55%,transparent)]" />
    </div>
  );
}
