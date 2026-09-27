"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Fades its children in the first time they scroll into view, and draws any .el-draw line art inside
// (globals.css). Under prefers-reduced-motion everything is shown as is.
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShown(true);
        io.disconnect();
      }
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-shown={shown || undefined} style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`el-reveal ${className}`}>
      {children}
    </div>
  );
}
