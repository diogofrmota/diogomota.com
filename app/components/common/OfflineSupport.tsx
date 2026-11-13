"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) that lets the apps open without a
 * connection. Only in a production build: with `next dev` (and the e2e tests'
 * server) its cache would keep files the dev server rebuilds.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
      console.warn("The offline support couldn't start", error);
    });
  }, []);
  return null;
}
