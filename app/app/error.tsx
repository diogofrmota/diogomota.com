"use client";

import { MessagePage } from "@/components/site/MessagePage";
import { siteName } from "@/lib/site";

// Shown instead of a page that failed to render, such as when the database
// can't be reached; Retry renders it again. The error itself is only in the
// server's logs (production sends the browser a digest, not the message).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <title>{`something went wrong · ${siteName}`}</title>
      <MessagePage
        title="something went wrong"
        message="This page couldn't load. Try again in a moment."
        link={{ href: "/apps", label: "Back to Apps" }}
        onRetry={retry}
      />
    </>
  );
}
