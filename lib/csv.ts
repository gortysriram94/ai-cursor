// lib/csv.ts — shared types and utilities used by the Next.js app
// Parsing and cleaning all happens in public/worker.js

export interface CleanResult {
  headers: string[];
  previewRows: string[][];
  cleanedData: string;
  ragJsonl: string;
  inputFormat: string;
  originalRowCount: number;
  cleanedRowCount: number;
  duplicatesRemoved: number;
  emptyRowsRemoved: number;
  redundantColumnsRemoved: number;
  originalCharCount: number;
  cleanedCharCount: number;
  originalTokens: number;
  cleanedTokens: number;
  tokenReductionPct: number;
  qualityBefore: number;
  qualityAfter: number;
  piiSuspectColumns: string[];
  piiMaskEnabled: boolean;
  piiTotalMasked: number;
  piiCountByType: Record<string, number>;
  contextTargetTokens: number;
  contextRowsDropped: number;
  contextTokensFit: number;
  costAudit: CostAuditRow[];
  promptTemplateTokens: number;
  callsPerMonth: number;
}

export interface CostAuditRow {
  provider: string;
  model: string;
  inputPer1k: number;
  costPerCallBefore: string;
  costPerCallAfter: string;
  monthlyBefore: string;
  monthlyAfter: string;
  monthlySavings: string;
  savingsPct: number;
}

export type PricingTier = "starter" | "standard" | "pro" | "enterprise";

// PII add-on pricing (shown on export button when PII masking was applied)
export const PII_ADDON_PRICE: Record<PricingTier, string> = {
  starter:    "$1.99",
  standard:   "$6.99",
  pro:        "$17.99",
  enterprise: "$34.99",
};

export function getTier(fileSizeBytes: number): {
  tier: PricingTier;
  price: string;
  label: string;
} | null {
  const mb = fileSizeBytes / (1024 * 1024);
  if (mb <= 1)   return { tier: "starter",    price: "$0.99",  label: "Starter"    };
  if (mb <= 10)  return { tier: "standard",   price: "$4.99",  label: "Standard"   };
  if (mb <= 50)  return { tier: "pro",        price: "$14.99", label: "Pro"        };
  if (mb <= 200) return { tier: "enterprise", price: "$29.99", label: "Enterprise" };
  return null; // over 200MB — unsupported
}
