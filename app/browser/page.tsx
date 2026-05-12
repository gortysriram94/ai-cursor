// app/browser/page.tsx
// Custom browser iframe page — same domain so no restrictions.
// Loads via /api/browser-fetch, renders real HTML with full JS,
// bridges postMessage to parent for agent control.

"use client";

import { useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function BrowserFrame() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Relay postMessage from inner iframe to parent canvas
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Inner iframe → parent page
      if (e.data?.bridge === "VBROWSER" || e.data?.bridge === "AGENT_RESPONSE") {
        window.parent?.postMessage(e.data, "*");
      }
      // Parent page → inner iframe (agent commands)
      if (e.data?.bridge === "AGENT") {
        iframeRef.current?.contentWindow?.postMessage(e.data, "*");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!url) return <div style={{ padding: 40, color: "#999", fontFamily: "sans-serif" }}>No URL</div>;

  return (
    <iframe
      ref={iframeRef}
      src={`/api/browser-fetch?url=${encodeURIComponent(url)}`}
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
      title="browser"
    />
  );
}

export default function BrowserPage() {
  return (
    <Suspense fallback={null}>
      <BrowserFrame />
    </Suspense>
  );
}