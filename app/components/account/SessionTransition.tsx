"use client";
import { useEffect, useState } from "react";
import { clearOfflineData } from "@/components/common/QueryProvider";

export function SessionTransition({ destination, preservePending }: { destination: string; preservePending: boolean }) {
  const [error, setError] = useState(false);
  useEffect(() => {
    void clearOfflineData(preservePending)
      .then(() => window.location.replace(destination))
      .catch(() => setError(true));
  }, [destination, preservePending]);
  return (
    <main>
      <p role="status">
        {error
          ? "Device cleanup failed. Reconnect and reload to finish safely."
          : "Updating your session and clearing offline views…"}
      </p>
    </main>
  );
}
