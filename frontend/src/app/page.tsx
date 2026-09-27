import { redirect } from "next/navigation";

// Temporary entry point, to be replaced by the team's landing page.
// The case library lives at /cases independently of that page.
export default function Home() { redirect("/cases"); }
