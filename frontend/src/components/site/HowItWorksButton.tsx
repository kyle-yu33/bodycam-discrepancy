"use client";

export const HOW_IT_WORKS_ID = "how-it-works";

// Home page header link: glides down to the "Under the hood" section.
export function HowItWorksButton({ className }: { className?: string }) {
  return (
    <a href={`#${HOW_IT_WORKS_ID}`} className={className} onClick={(e) => {
      e.preventDefault();
      document.getElementById(HOW_IT_WORKS_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }}>How it works</a>
  );
}
