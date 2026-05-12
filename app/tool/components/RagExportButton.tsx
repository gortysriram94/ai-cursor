"use client";

import { useState } from "react";
import { storeDataset, clearDataset } from "@/lib/db";
import CheckoutModal from "./CheckoutModal";

interface Props {
  stats: { ragJsonl: string; cleanedData: string } | null;
  tier: { tier: "starter" | "standard" | "pro" | "enterprise"; price: string; label: string } | null;
}

const RAG_PRICE_MAP: Record<string, string> = {
  starter:    "$1.99",
  standard:   "$7.99",
  pro:        "$19.99",
  enterprise: "$39.99",
};

export default function RagExportButton({ stats, tier }: Props) {
  const [loading, setLoading] = useState(false);
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);

  const handleRagExport = async () => {
    if (!stats || !tier) return;
    setLoading(true);
    const id = crypto.randomUUID();
    try {
      const ragData = stats.ragJsonl || stats.cleanedData;
      await storeDataset(id, ragData);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tier.tier, datasetId: id, exportType: "rag_jsonl" }),
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

  return (
    <>
      <button
        onClick={handleRagExport}
        disabled={loading || !tier || !stats}
        style={{
          background: "#5E8FC8", color: "white", border: "none",
          padding: "16px 24px", fontFamily: "monospace", fontSize: 13, fontWeight: 700,
          cursor: loading || !tier || !stats ? "not-allowed" : "pointer",
          opacity: loading || !tier || !stats ? 0.5 : 1,
          letterSpacing: "0.05em", width: "100%",
        }}
      >
        {loading
          ? "PREPARING RAG EXPORT…"
          : `EXPORT AS RAG-READY JSONL — ${tier ? RAG_PRICE_MAP[tier.tier] : ""} (${tier?.label ?? ""})`}
      </button>

      {checkoutSecret && (
        <CheckoutModal clientSecret={checkoutSecret} onClose={() => setCheckoutSecret(null)} />
      )}
    </>
  );
}
