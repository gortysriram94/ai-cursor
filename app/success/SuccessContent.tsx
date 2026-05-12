"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getDataset, clearDataset } from "@/lib/db";
import { storeCustomerId } from "@/lib/credits";

type Status = "verifying" | "downloading" | "done" | "error";

function buildRAGJsonl(csv: string) {
  const lines = csv.split("\n").filter(Boolean);
  if (lines.length < 2) return "";
  const headers = lines[0].split(",");
  const rows = lines.slice(1);
  return rows.map((line, i) => {
    const values = line.split(",");
    const metadata: Record<string, string> = {};
    const textParts: string[] = [];
    headers.forEach((h, idx) => {
      const val = values[idx] || "";
      if (!val) return;
      metadata[h] = val;
      textParts.push(val);
    });
    return JSON.stringify({ id: `doc_${i}`, text: textParts.join(" "), metadata });
  }).join("\n");
}

export default function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState("");
  const exportType = searchParams.get("export_type") || "csv";

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const datasetId = searchParams.get("dataset_id");

    if (!sessionId || (!datasetId && exportType !== "credit_pack")) {
      setErrorMsg("Missing payment or dataset reference. Please try again.");
      setStatus("error");
      return;
    }

    const run = async () => {
      try {
        const res = await fetch(`/api/verify?session_id=${sessionId}`);
        const data = await res.json();
        if (!data.verified) {
          setErrorMsg("Payment not confirmed. If you completed checkout, wait a moment and refresh.");
          setStatus("error");
          return;
        }
      } catch {
        setErrorMsg("Could not verify payment. Please contact support.");
        setStatus("error");
        return;
      }

      if (exportType === "credit_pack") {
        // Add credits server-side via Stripe Customer metadata
        try {
          const email = searchParams.get("email") || undefined;
          const res = await fetch("/api/credits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              creditType: "export",
              amount: 5,
              email,
            }),
          });
          const data = await res.json();
          if (data.customerId) {
            // Store customer ID locally so tool page can fetch balance
            storeCustomerId(data.customerId);
          }
        } catch {
          // Credits may still have been added — non-fatal
          console.warn("Could not confirm credit update");
        }
        setStatus("done");
        return;
      }

      setStatus("downloading");
      try {
        const csvData = await getDataset(datasetId!);
        if (!csvData) {
          setErrorMsg("Optimized dataset not found in browser storage. This can happen if you switched browsers or cleared storage.");
          setStatus("error");
          return;
        }

        const storedName = localStorage.getItem(`tokenlift_fname_${datasetId}`) || "optimized";
        localStorage.removeItem(`tokenlift_fname_${datasetId}`);

        let fileData = csvData;
        let mimeType = "text/csv;charset=utf-8;";
        let fileName = `${storedName}.csv`;

        if (exportType === "rag_jsonl") {
          fileData = buildRAGJsonl(csvData);
          mimeType = "application/jsonl;charset=utf-8;";
          fileName = `${storedName}.jsonl`;
        }

        const blob = new Blob([fileData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await clearDataset(datasetId!);
        setStatus("done");
      } catch {
        setErrorMsg("Failed to retrieve or download dataset.");
        setStatus("error");
      }
    };

    run();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[var(--surface)] flex flex-col">
      <nav className="border-b border-[var(--border)] px-6 py-4">
        <Link href="/" className="mono text-[var(--accent)] font-semibold tracking-tight">
          TokenLift
        </Link>
      </nav>

      <div className="flex-1 px-6 py-12">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Verifying */}
          {status === "verifying" && (
            <div className="text-center space-y-4">
              <div className="mono text-xs text-muted tracking-widest">VERIFYING PAYMENT</div>
              <div className="text-4xl animate-pulse">⟳</div>
              <p className="text-muted text-sm">Confirming your Stripe session...</p>
            </div>
          )}

          {/* Downloading */}
          {status === "downloading" && (
            <div className="text-center space-y-4">
              <div className="mono text-xs text-[var(--accent)] tracking-widest">PAYMENT CONFIRMED</div>
              <div className="text-4xl">↓</div>
              <p className="text-white text-lg font-light">Preparing your download...</p>
            </div>
          )}

          {/* Done */}
          {status === "done" && (
            <>
              {/* Header */}
              <div className="border border-[var(--border)] bg-[var(--panel)] p-6 flex items-center gap-6">
                <div className="text-4xl text-[var(--accent)]">✓</div>
                <div>
                  <div className="mono text-xs text-[var(--accent)] tracking-widest mb-1">
                    {exportType === "credit_pack" ? "CREDITS ADDED" : "DOWNLOAD COMPLETE"}
                  </div>
                  <p className="text-white text-lg font-light">
                    {exportType === "credit_pack"
                      ? "5 export credits added to this browser."
                      : "Your optimized dataset is in your downloads folder."}
                  </p>
                  <p className="text-muted text-sm mt-1">
                    {exportType === "credit_pack"
                      ? "Use them on any file — no checkout needed each time."
                      : "Your original file was never uploaded to any server."}
                  </p>
                </div>
              </div>

              {/* What to do next with this file */}
              {exportType !== "credit_pack" && (
                <div>
                  <div className="mono text-xs text-muted tracking-widest mb-4">WHAT TO DO WITH YOUR FILE NOW</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--border)]">
                    {[
                      {
                        title: "Feed into embeddings",
                        desc: "Pass rows directly to OpenAI, Cohere, or Voyage embeddings. Fewer tokens = lower cost per vector.",
                        code: "openai.embeddings.create({ input: rows })",
                      },
                      {
                        title: "Ingest into vector DB",
                        desc: "Load into Pinecone, Weaviate, ChromaDB, or Qdrant. Go back to the tool and export in Vector DB format.",
                        code: "index.upsert(vectors)",
                      },
                      {
                        title: "Use as LLM context",
                        desc: "Inject cleaned rows into your system prompt. Token reduction means more rows fit in the context window.",
                        code: "messages: [{ role: 'system', content: rows }]",
                      },
                    ].map(item => (
                      <div key={item.title} className="bg-[var(--panel)] p-5">
                        <div className="mono text-xs text-[var(--accent)] font-semibold mb-2">{item.title}</div>
                        <p className="text-muted text-xs leading-relaxed mb-3">{item.desc}</p>
                        <code className="mono text-[10px] text-[var(--muted)] bg-[var(--surface)] px-2 py-1 block truncate">{item.code}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* More export formats (only shown for CSV exports) */}
              {(exportType === "csv" || exportType === "csv_pii") && (
                <div>
                  <div className="mono text-xs text-muted tracking-widest mb-4">MORE EXPORT FORMATS FOR THIS DATASET</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--border)]">
                    <div className="bg-[var(--panel)] p-5 flex gap-4">
                      <div className="text-2xl">⚡</div>
                      <div>
                        <div className="mono text-xs text-[var(--accent)] font-semibold mb-1">RAG-READY JSONL</div>
                        <p className="text-muted text-xs leading-relaxed mb-3">Pre-chunked, structured for LangChain, LlamaIndex, and any RAG pipeline. Drop it straight into your ingestion script.</p>
                        <Link href="/tool" className="mono text-xs border border-[var(--border)] text-muted px-3 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors inline-block">
                          EXPORT AS JSONL →
                        </Link>
                      </div>
                    </div>
                    <div className="bg-[var(--panel)] p-5 flex gap-4">
                      <div className="text-2xl">🗄</div>
                      <div>
                        <div className="mono text-xs text-[var(--accent)] font-semibold mb-1">VECTOR DB SCHEMA</div>
                        <p className="text-muted text-xs leading-relaxed mb-3">Pinecone, Weaviate, ChromaDB, or Qdrant format. Vector fields ready for your embedding model to populate.</p>
                        <Link href="/tool" className="mono text-xs border border-[var(--border)] text-muted px-3 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors inline-block">
                          EXPORT FOR VECTOR DB →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Credit pack upsell */}
              {exportType !== "credit_pack" && (
                <div className="border border-[var(--accent)] bg-[rgba(218,119,86,0.05)] p-5 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1">
                    <div className="mono text-xs text-[var(--accent)] font-semibold mb-1">SKIP CHECKOUT NEXT TIME</div>
                    <p className="text-muted text-sm">Buy a 5-file credit pack for $19.99 and export instantly without going through Stripe again. Credits stay in your browser.</p>
                  </div>
                  <Link href="/tool" className="mono text-xs bg-[var(--accent)] text-[var(--surface)] px-6 py-2.5 font-semibold hover:bg-[var(--accent-dim)] transition-colors whitespace-nowrap text-center">
                    GET 5-FILE PACK →
                  </Link>
                </div>
              )}

              {/* Bottom actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/tool" className="mono text-xs bg-[var(--accent)] text-[var(--surface)] px-8 py-3 font-semibold hover:bg-[var(--accent-dim)] transition-colors text-center">
                  BACK TO TOOL →
                </Link>
                <Link href="/" className="mono text-xs border border-[var(--border)] text-muted px-8 py-3 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors text-center">
                  VIEW ALL FEATURES
                </Link>
              </div>
            </>
          )}

          {status === "error" && (
            <div className="max-w-md mx-auto text-center space-y-4">
              <div className="mono text-xs text-[var(--danger)] tracking-widest">ERROR</div>
              <div className="text-4xl">✗</div>
              <p className="text-white text-lg font-light">Something went wrong.</p>
              <div className="bg-panel border border-red-900/50 p-4">
                <p className="text-[var(--danger)] text-sm font-mono">{errorMsg}</p>
              </div>
              <div className="flex gap-3 justify-center">
                <button onClick={() => router.refresh()} className="mono text-xs border border-[var(--border)] text-muted px-4 py-2 hover:border-muted hover:text-white transition-colors">
                  RETRY
                </button>
                <Link href="/tool" className="mono text-xs border border-[var(--border)] text-muted px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                  BACK TO TOOL
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
