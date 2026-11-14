"use client";

import { MessagePage } from "@/components/site/MessagePage";
import { siteName } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";

// Shown instead of a page that failed to render, such as when the database
// can't be reached; Retry renders it again. In the apps' look, in the default
// theme and without a tab bar: who is logged in, and their theme, are what the
// server couldn't say. The error itself is only in the server's logs
// (production sends the browser a digest, not the message).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <title>{`something went wrong · ${siteName}`}</title>
      <MessagePage
        title="Something went wrong"
        message="This page couldn't load. Try again in a moment."
        link={{ href: "/", label: "Go home" }}
        onRetry={retry}
        theme={defaultTheme}
        bare
      />
    </>
  );
}
