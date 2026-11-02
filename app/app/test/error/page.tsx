import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { testHooksEnabled } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Error test", robots: { index: false } };

// The ids this page has failed for.
const failed = new Set<string>();

// For the e2e tests (e2e/site.spec.ts): fails to render the first time it is
// asked for with each ?id, as a page does when the database is down, then
// renders, so the error page (app/error.tsx) and its Retry can be tested. Not
// found unless test hooks are on, so never in production.
export default async function ErrorTestPage({ searchParams }: PageProps<"/test/error">) {
  if (!testHooksEnabled()) notFound();
  const id = String((await searchParams).id);
  if (!failed.has(id)) {
    failed.add(id);
    throw new Error("The error test page fails once.");
  }
  return (
    <main>
      <h1>Rendered</h1>
    </main>
  );
}
