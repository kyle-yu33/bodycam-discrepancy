"use client";
import { use } from "react";
import { Workspace } from "@/components/review/Workspace";

export default function CasePage({ params }: { params: Promise<{ case: string }> }) {
  const { case: caseId } = use(params);
  return <Workspace caseId={caseId} />;
}
