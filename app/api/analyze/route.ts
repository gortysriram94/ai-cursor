// app/api/analyze/route.ts
// BuyDecision AI - Financial analysis endpoint
// Uses Kimi/Claude + CoinGecko + Jina Read for comprehensive analysis

import { NextRequest, NextResponse } from "next/server";
import { kimiComplete } from "@/lib/agents/kimi-server";
import { gatherAssetData } from "@/lib/financial-tools";
import { getStoredCustomerId, fetchActionCredits, deductCredit } from "@/lib/credits";

const CREDITS_PER_ANALYSIS = 2;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { asset, price, timeframe, customerId } = body;

    if (!asset) {
      return NextResponse.json(
        { error: "Missing required field: asset" },
        { status: 400 }
      );
    }

    // Check and deduct credits
    if (customerId) {
      const credits = await fetchActionCredits(customerId);
      if (credits < CREDITS_PER_ANALYSIS) {
        return NextResponse.json(
          { error: "Insufficient credits", credits, required: CREDITS_PER_ANALYSIS },
          { status: 402 }
        );
      }
      await deductCredit(customerId, "action", CREDITS_PER_ANALYSIS);
    }

    // Gather market data (CoinGecko, Yahoo Finance, news)
    const marketData = await gatherAssetData(asset);

    // Build analysis prompt
    const prompt = `You are BuyDecision AI, a financial advisor.

IMPORTANT DISCLAIMER: This is educational analysis only, NOT financial advice. Past performance doesn't predict future results. Consult a qualified financial advisor before making investment decisions.

ASSET TO ANALYZE: ${asset}
${price ? `CURRENT PRICE: $${price}` : ""}
${timeframe ? `TIMEFRAME: ${timeframe}` : ""}

MARKET DATA:
${marketData}

Provide a comprehensive analysis with:
1. Decision: [BUY/SELL/HOLD] with confidence (1-10)
2. Three key reasons for your recommendation
3. Three risk factors to consider
4. Suggested entry price (if buying)
5. Stop-loss level for risk management
6. Take-profit target

Format your response as JSON:
{
  "decision": "BUY|SELL|HOLD",
  "confidence": 8,
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "risks": ["risk 1", "risk 2", "risk 3"],
  "entryPrice": 45000,
  "stopLoss": 42000,
  "takeProfit": 52000,
  "summary": "Brief 2-sentence summary"
}`;

    // Run analysis through Kimi
    const { text } = await kimiComplete(
      `You are BuyDecision AI, a financial analysis expert. Always respond with valid JSON.`,
      [{ role: "user", content: prompt }],
      2048,
    );

    // Parse JSON response
    let analysis;
    try {
      const jsonMatch = text.match(/\{[\s\S]+\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      // Fallback if JSON parsing fails
      analysis = {
        decision: "HOLD",
        confidence: 5,
        reasons: ["Analysis incomplete - please try again"],
        risks: ["Unable to complete full analysis"],
        summary: text.slice(0, 500),
      };
    }

    return NextResponse.json({
      success: true,
      asset,
      analysis,
      creditsUsed: CREDITS_PER_ANALYSIS,
      disclaimer: "This is educational analysis only. Not financial advice.",
    });

  } catch (err: unknown) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
