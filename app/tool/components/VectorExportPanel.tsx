"use client";

import { useState } from "react";
import { storeDataset, clearDataset } from "@/lib/db";
import CheckoutModal from "./CheckoutModal";
import { PricingTier } from "@/lib/csv";

type VectorFormat = "pinecone" | "weaviate" | "chromadb" | "qdrant";

interface Props {
  stats: { headers: string[]; ragJsonl: string; cleanedData: string } | null;
  tier: { tier: PricingTier; price: string; label: string } | null;
}

const FORMATS: { id: VectorFormat; label: string; color: string; desc: string }[] = [
  { id: "pinecone",  label: "Pinecone",  color: "#4A90D9", desc: "{id, values:[], metadata:{}}" },
  { id: "weaviate",  label: "Weaviate",  color: "#68B48D", desc: "{class, properties:{}, id}" },
  { id: "chromadb",  label: "ChromaDB",  color: "#E08F5C", desc: "{id, document, metadata:{}}" },
  { id: "qdrant",    label: "Qdrant",    color: "#C44569", desc: "{id, payload:{}, vector:[]}" },
];

const VECTOR_PRICE_MAP: Record<PricingTier, string> = {
  starter:    "$2.99",
  standard:   "$8.99",
  pro:        "$22.99",
  enterprise: "$44.99",
};

function buildVectorJsonl(format: VectorFormat, headers: string[], cleanedData: string): string {
  const lines = cleanedData.split("\n").filter(Boolean);
  if (lines.length < 2) return "";
  const rows = lines.slice(1);

  return rows.map((line, i) => {
    const values = line.split(",");
    const props: Record<string, string> = {};
    headers.forEach((h, idx) => { if (values[idx]) props[h] = values[idx]; });
    const text = Object.values(props).join(" ");

    if (format === "pinecone") {
      return JSON.stringify({ id: `vec_${i}`, values: [], sparse_values: {}, metadata: { ...props, text } });
    }
    if (format === "weaviate") {
      return JSON.stringify({ class: "Document", id: `vec_${i}`, properties: { ...props, text } });
    }
    if (format === "chromadb") {
      return JSON.stringify({ id: `vec_${i}`, document: text, metadata: props });
    }
    // qdrant
    return JSON.stringify({ id: i, payload: { ...props, text }, vector: [] });
  }).join("\n");
}

export default function VectorExportPanel({ stats, tier }: Props) {
  const [selected, setSelected] = useState<VectorFormat>("pinecone");
  const [loading, setLoading] = useState(false);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);

  const handleExport = async () => {
    if (!stats || !tier) return;
    setLoading(true);
    const jsonl = buildVectorJsonl(selected, stats.headers, stats.cleanedData);
    const id = crypto.randomUUID();
    try {
      await storeDataset(id, jsonl);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.tier, datasetId: id, exportType: "vector_db" }),
      });
      const data = await res.json();
      if (data.clientSecret) {
        setCheckoutSecret(data.clientSecret);
      } else {
        await clearDataset(id);
      }
    } catch {
      await clearDataset(id).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const fmt = FORMATS.find(f => f.id === selected)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em", marginBottom: 16 }}>
          SELECT TARGET DATABASE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {FORMATS.map(f => (
            <button key={f.id} onClick={() => setSelected(f.id)}
              style={{
                background: selected === f.id ? `${f.color}18` : "var(--panel)",
                border: `1px solid ${selected === f.id ? f.color : "var(--border)"}`,
                color: selected === f.id ? f.color : "var(--muted)",
                padding: "12px 8px", cursor: "pointer", fontFamily: "monospace",
                transition: "all 0.15s",
              }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 9, opacity: 0.7, wordBreak: "break-all" }}>{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--panel)", border: `1px solid ${fmt.color}40`, padding: 16 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>SCHEMA PREVIEW</div>
        <pre style={{ fontSize: 11, color: fmt.color, margin: 0, overflowX: "auto" }}>
          {selected === "pinecone"  && `{"id":"vec_0","values":[],"metadata":{"col":"value","text":"..."}}`}
          {selected === "weaviate"  && `{"class":"Document","id":"vec_0","properties":{"col":"value","text":"..."}}`}
          {selected === "chromadb"  && `{"id":"vec_0","document":"...","metadata":{"col":"value"}}`}
          {selected === "qdrant"    && `{"id":0,"payload":{"col":"value","text":"..."},"vector":[]}`}
        </pre>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
          Vector fields left empty — populate with your embedding model output after export.
        </div>
      </div>

      <button onClick={handleExport} disabled={loading || !tier || !stats}
        style={{
          background: fmt.color, color: "white", border: "none",
          padding: "16px 24px", fontFamily: "monospace", fontSize: 13, fontWeight: 700,
          cursor: loading || !tier || !stats ? "not-allowed" : "pointer",
          opacity: loading || !tier || !stats ? 0.5 : 1, letterSpacing: "0.05em", width: "100%",
        }}>
        {loading
          ? "PREPARING VECTOR EXPORT…"
          : `EXPORT FOR ${fmt.label.toUpperCase()} — ${tier ? VECTOR_PRICE_MAP[tier.tier] : ""} (${tier?.label ?? ""})`}
      </button>

      {checkoutSecret && (
        <CheckoutModal clientSecret={checkoutSecret} onClose={() => setCheckoutSecret(null)} />
      )}
    </div>
  );
}
