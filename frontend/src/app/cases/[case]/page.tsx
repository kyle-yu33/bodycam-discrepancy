"use client";
import { use } from "react";
import { CasePage as CaseView } from "@/components/CasePage";

export default function CasePage({ params }: { params: Promise<{ case: string }> }) {
  const { case: caseId } = use(params);
  return <CaseView key={caseId} caseId={caseId} />;
}
