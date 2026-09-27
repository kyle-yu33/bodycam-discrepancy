import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@/components/review/Icons";
import { HOW_IT_WORKS_ID, HowItWorksButton } from "@/components/site/HowItWorksButton";
import { CloudBackdrop, FootageIllustration, PoseIllustration, RecheckIllustration } from "@/components/site/Illustrations";
import { RecentCases } from "@/components/site/RecentCases";
import { Reveal } from "@/components/site/Reveal";
import { SiteHeader } from "@/components/site/SiteHeader";
import { BUTTON_PRIMARY, EYEBROW } from "@/components/site/styles";
import { EXAMPLE_ORDER } from "@/lib/present";

export const metadata: Metadata = {
  title: "evidently · Check a police report against body-worn camera footage",
};

// "See an example" opens the strongest cached demo case.
const EXAMPLE_HREF = `/cases/${EXAMPLE_ORDER[0]}`;

const NAV = "hidden h-9 items-center rounded-md px-3 text-sm text-ink-2 transition-colors hover:bg-sunken hover:text-ink sm:inline-flex";
const H2 = "mt-4 text-balance font-serif text-[38px] font-medium leading-[1.08] tracking-tight text-ink sm:text-5xl";

// What reads the footage (backend/app/pose.py, claims.py): keep these in step with the pipeline.
const TECH = [
  { art: PoseIllustration, title: "Pose estimation", spec: "17 keypoints · 10 fps · per-person tracking",
    body: "YOLO11 finds 17 body keypoints on every person, ten times a second, and ByteTrack follows each person between frames. Movements like a raised arm become measurements the video model can check against." },
  { art: FootageIllustration, title: "Video and audio, together", spec: "Native video and audio · timed windows",
    body: "Gemini watches the footage and listens to its audio in a single pass, with a clock burned into every frame, so each claim is tied to a time window you can play." },
  { art: RecheckIllustration, title: "A second, independent look", spec: "Clean clip · 5 fps · no shared context",
    body: "Every flag is re-examined on a clean, narrow clip by a separate model call that never sees the first answer. If it doesn't agree, the claim is marked insufficient footage." },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader>
        <HowItWorksButton className={NAV} />
        <Link href="/cases" className={NAV}>Cases</Link>
        <Link href={EXAMPLE_HREF} className={NAV}>Example</Link>
        <Link href="/new" className="inline-flex h-10 items-center whitespace-nowrap rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-hi">
          Upload files
        </Link>
      </SiteHeader>

      {/* overflow-x-clip: on wide screens the hero illustration runs past its column, never past the viewport. */}
      <main className="overflow-x-clip">
        <section className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-7xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-6">
          <div className="el-enter">
            <h1 className="text-balance font-serif text-[48px] font-semibold leading-[1.02] tracking-[-0.015em] text-ink sm:text-[64px] lg:text-[72px]">
              Review evidence with clarity.
            </h1>
            <p className="mt-6 max-w-md text-pretty text-lg leading-8 text-ink-2 sm:text-xl sm:leading-9">
              Compare reports against footage and jump straight to the moments that matter.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
              <Link href="/new" className="group inline-flex h-13 items-center gap-2.5 rounded-lg bg-brand px-7 text-[17px] font-medium text-white shadow-sm transition hover:bg-brand-hi">
                Upload files <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href={EXAMPLE_HREF} className="text-[15px] text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">
                See an example
              </Link>
            </div>
          </div>
          {/* Transparent PNG: its watercolour cloud blends straight into the page. */}
          <Image src="/landing/hero-evidence.png" width={944} height={708} loading="eager" fetchPriority="high"
            sizes="(min-width: 1536px) 820px, (min-width: 1024px) 740px, 100vw"
            alt="Illustration: lines in an incident report and a witness statement linked to moments in body-worn camera footage and its audio"
            className="el-enter mx-auto h-auto w-full max-w-195 lg:max-w-none 2xl:w-[112%]" />
        </section>

        <section className="border-t border-hairline">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20 lg:py-32">
            <Reveal>
              {/* Toned to the page palette and feathered to transparency, so it dissolves into the background. */}
              <Image src="/landing/swamped.png" width={512} height={512} sizes="(min-width: 1024px) 560px, 100vw"
                alt="A person working at a desk in a small room stacked floor to ceiling with paper files"
                className="mx-auto h-auto w-full max-w-140" />
            </Reveal>
            <Reveal delay={150}>
              <p className={EYEBROW}>Why it matters</p>
              <h2 className={H2}>Criminal cases are swamped with information.</h2>
              <p className="mt-6 text-pretty text-[17px] leading-8 text-ink-2">
                One arrest can mean hours of video from several body-worn cameras, and a report that sums it all up in a
                page or two. Checking one against the other, moment by moment, takes time most defence teams don’t have.
              </p>
              <p className="mt-8 text-pretty border-l border-brass/60 pl-5 font-serif text-2xl leading-snug text-ink">
                evidently takes the first pass through the footage, so you can get back to the work that matters.
              </p>
            </Reveal>
          </div>
        </section>

        <section id={HOW_IT_WORKS_ID} className="relative scroll-mt-14 border-t border-hairline">
          <CloudBackdrop />
          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-32">
            <Reveal className="max-w-2xl">
              <p className={EYEBROW}>Under the hood</p>
              <h2 className={H2}>Computer vision that shows its work.</h2>
              <p className="mt-6 text-pretty text-[17px] leading-8 text-ink-2">
                Three systems read the footage together. None of them decides anything on its own, and each leaves
                evidence you can check.
              </p>
            </Reveal>
            <div className="mt-16 grid grid-cols-1 gap-14 md:grid-cols-3 md:gap-10">
              {TECH.map(({ art: Art, title, body, spec }, i) => (
                <Reveal key={title} delay={i * 120}>
                  <div className="rounded-xl border border-hairline bg-surface/50 px-6 py-7">
                    <Art className="mx-auto w-full max-w-65 text-ink" />
                  </div>
                  <h3 className="mt-7 text-[17px] font-medium text-ink">{title}</h3>
                  <p className="mt-2 text-pretty text-[15px] leading-7 text-muted">{body}</p>
                  <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2/70">{spec}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* On desktop the section is exactly as tall as the statue (56% wide, 1250x832), so its top edge meets her cropped hand. */}
        <section className="relative overflow-hidden border-t border-hairline lg:aspect-[2.683/1]">
          {/* Lady Justice, cut out of its grey backdrop and toned to the page (public/landing/justice.png): she
              rises from the bottom-left, scales held out toward the copy. Faint behind the text on small screens. */}
          <Image src="/landing/justice.png" width={1250} height={832} alt="" sizes="(min-width: 1024px) 820px, 150vw"
            className="pointer-events-none absolute bottom-0 -left-[10%] h-auto w-[150%] max-w-none select-none opacity-30 sm:opacity-40 lg:-left-[3%] lg:w-[56%] lg:opacity-100" />
          <div className="relative mx-auto grid max-w-7xl grid-cols-1 px-4 py-28 sm:px-6 lg:h-full lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-0">
            <Reveal className="lg:col-start-2">
              <h2 className="text-balance font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">
                Start with one report and one video.
              </h2>
              <p className="mt-5 max-w-md text-pretty text-[17px] leading-8 text-ink-2">
                A short clip is analyzed in a few minutes. evidently finds the moments that matter; you decide what
                they mean.
              </p>
              <Link href="/new" className={`group mt-9 ${BUTTON_PRIMARY}`}>
                Upload files <ArrowRight className="h-4.5 w-4.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
          </div>
        </section>

        <section id="cases" className="border-t border-hairline">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className={EYEBROW}>Analyzed cases</h2>
            <div className="mt-5"><RecentCases /></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-xs leading-5 text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="inline-flex items-center gap-1.5 text-brass"><ShieldCheck className="h-3.5 w-3.5" /> Human review required</span>
          <span>
            This prototype surfaces source-linked review questions. It does not make legal conclusions. Demo reports are
            fictional; demo footage is publicly released.
          </span>
        </div>
      </footer>
    </div>
  );
}
