// lib/verticals.ts
// Vertical mode configs — each vertical defines normalizers, PII patterns,
// report language, user input fields, and a prompt template.

export interface VerticalConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  normalizers: string[];
  piiTypes: string[];
  reportLanguage: { rows: string; duplicates: string; reduction: string };
  userInputFields: Array<{ key: string; label: string; placeholder: string }>;
  promptTemplate: (stats: Record<string, any>, userInputs: Record<string, string>) => string;
}

export const VERTICALS: Record<string, VerticalConfig> = {
  general: {
    id: "general",
    label: "General Dataset",
    icon: "◈",
    description: "Any structured data",
    normalizers: [],
    piiTypes: ["email", "phone", "ssn", "creditCard", "ipv4", "uuid"],
    reportLanguage: { rows: "rows", duplicates: "duplicate rows", reduction: "Token reduction" },
    userInputFields: [
      { key: "task", label: "What do you want AI to do?", placeholder: "Analyze this dataset and identify key patterns" },
    ],
    promptTemplate: (stats, userInputs) => `
You are analyzing a dataset.

DATASET SUMMARY:
- Rows: ${stats.cleanedRowCount}
- Columns: ${(stats.headers || []).join(", ")}
- Data quality score: ${stats.qualityAfter}/100
- Token count: ${(stats.cleanedTokens || 0).toLocaleString()}

TASK: ${userInputs.task || "Analyze this dataset and identify key patterns"}

[CLEANED DATA FOLLOWS]
    `.trim(),
  },

  ux_research: {
    id: "ux_research",
    label: "UX Research",
    icon: "◉",
    description: "Usability tests, surveys, interviews",
    normalizers: ["rating_scale", "task_result", "participant"],
    piiTypes: ["email", "name", "phone"],
    reportLanguage: { rows: "participant responses", duplicates: "duplicate responses", reduction: "Analysis token reduction" },
    userInputFields: [
      { key: "product",  label: "Product / feature tested",    placeholder: "e.g. mobile checkout flow" },
      { key: "question", label: "Primary research question",   placeholder: "e.g. why do users abandon at payment?" },
    ],
    promptTemplate: (stats, userInputs) => `
You are a senior UX researcher analyzing usability data.

RESEARCH CONTEXT:
- Product tested: ${userInputs.product || "[not specified]"}
- Participants: ${stats.cleanedRowCount} responses
- Research question: ${userInputs.question || "[not specified]"}
- Columns: ${(stats.headers || []).join(", ")}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Identify the top 5 failure patterns with direct participant quotes
2. Calculate severity score (1-10) for each pattern
3. Suggest specific design fixes for each failure
4. Flag any critical issues requiring immediate attention
5. Format findings for a stakeholder design review

[CLEANED RESEARCH DATA FOLLOWS]
    `.trim(),
  },

  trader: {
    id: "trader",
    label: "Trading & Finance",
    icon: "◎",
    description: "Brokerage exports, trade journals, portfolio data",
    normalizers: ["currency", "ticker", "date_iso", "trade_type"],
    piiTypes: ["ssn", "account_number", "email"],
    reportLanguage: { rows: "trades", duplicates: "duplicate transactions", reduction: "Processing cost reduction" },
    userInputFields: [
      { key: "dateRange",  label: "Date range",    placeholder: "e.g. Jan 2025 – Dec 2025" },
      { key: "assetClass", label: "Asset class",   placeholder: "e.g. US equities, crypto, options" },
    ],
    promptTemplate: (stats, userInputs) => `
You are analyzing trading history data.

IMPORTANT: This is historical pattern analysis only.
Nothing in this analysis constitutes financial advice.
Past patterns do not predict future results.

TRADING DATA SUMMARY:
- Total trades: ${stats.cleanedRowCount}
- Columns available: ${(stats.headers || []).join(", ")}
- Date range: ${userInputs.dateRange || "see data"}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Identify win/loss patterns by day of week, time, hold duration
2. Find the 3 highest-performing trade setups in this data
3. Find the 3 lowest-performing setups
4. Identify any behavioral patterns (e.g. revenge trading, FOMO entries)
5. Calculate estimated annual impact of removing worst setups

Present findings as patterns in historical data only.
Do not make forward-looking predictions.

[CLEANED TRADING DATA FOLLOWS]
    `.trim(),
  },

  crypto: {
    id: "crypto",
    label: "Crypto Trading",
    icon: "◈",
    description: "Binance, Coinbase, Kraken, or any exchange export",
    normalizers: ["currency", "ticker", "date_iso", "trade_type", "amount"],
    piiTypes: ["email", "account_number", "ipv4"],
    reportLanguage: { rows: "transactions", duplicates: "duplicate transactions", reduction: "Processing cost reduction" },
    userInputFields: [
      { key: "exchange",  label: "Exchange(s)",   placeholder: "e.g. Binance, Coinbase, Kraken" },
      { key: "dateRange", label: "Date range",    placeholder: "e.g. Jan 2025 – Dec 2025" },
      { key: "focus",     label: "Analysis focus", placeholder: "e.g. P&L, tax report, best setups" },
    ],
    promptTemplate: (stats, userInputs) => `
You are analyzing cryptocurrency trading history.

IMPORTANT: This is historical pattern analysis only.
Nothing in this analysis constitutes financial or tax advice.
Consult a qualified tax professional for actual tax filing.

CRYPTO DATA SUMMARY:
- Total transactions: ${stats.cleanedRowCount}
- Exchange(s): ${userInputs.exchange || "see data"}
- Date range: ${userInputs.dateRange || "see data"}
- Columns: ${(stats.headers || []).join(", ")}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Break down P&L by coin/token — identify top 3 winners and top 3 losers by realized return
2. Analyze trade frequency and average hold time per asset
3. Identify fee drag — total fees paid and fee % of gross profit
4. Surface behavioral patterns: overtrading signals, panic sell clusters, FOMO buy spikes
5. Flag any wash-sale-style patterns or high-frequency round-trips worth reviewing with a tax professional
6. Summarize net realized P&L across the full period

Present all findings as patterns in historical data only.

[CLEANED CRYPTO DATA FOLLOWS]
    `.trim(),
  },

  stocks: {
    id: "stocks",
    label: "Stock Trading",
    icon: "▣",
    description: "TD Ameritrade, Schwab, Robinhood, E*TRADE, or any brokerage export",
    normalizers: ["currency", "ticker", "date_iso", "trade_type", "amount"],
    piiTypes: ["ssn", "account_number", "email"],
    reportLanguage: { rows: "transactions", duplicates: "duplicate entries", reduction: "Processing cost reduction" },
    userInputFields: [
      { key: "broker",    label: "Broker",         placeholder: "e.g. Schwab, Robinhood, TD Ameritrade" },
      { key: "dateRange", label: "Date range",      placeholder: "e.g. Jan 2025 – Dec 2025" },
      { key: "account",   label: "Account type",    placeholder: "e.g. Taxable, IRA, Roth IRA" },
      { key: "focus",     label: "Analysis focus",  placeholder: "e.g. performance, tax lots, sector breakdown" },
    ],
    promptTemplate: (stats, userInputs) => `
You are analyzing stock trading history from a brokerage account.

IMPORTANT: This is historical pattern analysis only.
Nothing in this analysis constitutes financial or tax advice.
Consult a qualified tax professional for actual tax filing.

STOCK DATA SUMMARY:
- Total transactions: ${stats.cleanedRowCount}
- Broker: ${userInputs.broker || "see data"}
- Account type: ${userInputs.account || "see data"}
- Date range: ${userInputs.dateRange || "see data"}
- Columns: ${(stats.headers || []).join(", ")}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Summarize realized P&L by ticker — top 5 winners and top 5 losers by dollar amount
2. Break down performance by sector if sector data is available or inferable from tickers
3. Analyze win rate, average gain on winners vs average loss on losers, and profit factor
4. Identify behavioral patterns: averaging down, holding losers too long, cutting winners early
5. Calculate total commissions/fees paid and their drag on returns
6. Flag any positions with short-term vs long-term holding periods (relevant for tax lots)
7. Identify the single biggest avoidable mistake visible in this data

Present all findings as patterns in historical data only.

[CLEANED STOCK DATA FOLLOWS]
    `.trim(),
  },

  aws: {
    id: "aws",
    label: "AWS Cost Analysis",
    icon: "▣",
    description: "Cost Explorer exports, billing reports",
    normalizers: ["currency", "aws_service", "aws_region", "aws_arn"],
    piiTypes: ["account_number", "email", "ipv4"],
    reportLanguage: { rows: "billing line items", duplicates: "duplicate entries", reduction: "Cost report token reduction" },
    userInputFields: [
      { key: "period",      label: "Billing period",    placeholder: "e.g. March 2026" },
      { key: "accountType", label: "Account type",      placeholder: "e.g. Production, Staging, All" },
    ],
    promptTemplate: (stats, userInputs) => `
You are a cloud cost optimization expert analyzing AWS billing data.

AWS COST DATA SUMMARY:
- Line items: ${stats.cleanedRowCount}
- Columns: ${(stats.headers || []).join(", ")}
- Period: ${userInputs.period || "see data"}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Identify the top 5 services driving highest costs
2. Flag any anomalous cost spikes vs the pattern in the data
3. Identify unused or underutilized resources
4. Suggest specific optimization actions with estimated savings
5. Prioritize recommendations by potential monthly savings

Format output as an actionable cost optimization report.

[CLEANED AWS BILLING DATA FOLLOWS]
    `.trim(),
  },

  bigquery: {
    id: "bigquery",
    label: "BigQuery / Data Engineering",
    icon: "▤",
    description: "Query history, job logs, pipeline data",
    normalizers: ["bytes", "duration", "bq_cost"],
    piiTypes: ["email", "account_number"],
    reportLanguage: { rows: "query jobs", duplicates: "duplicate query runs", reduction: "Log token reduction" },
    userInputFields: [
      { key: "period",  label: "Billing period", placeholder: "e.g. Last 30 days" },
      { key: "project", label: "GCP project",    placeholder: "e.g. my-project-id" },
    ],
    promptTemplate: (stats, userInputs) => `
You are a data engineering expert analyzing BigQuery usage.

BIGQUERY USAGE SUMMARY:
- Query jobs: ${stats.cleanedRowCount}
- Columns: ${(stats.headers || []).join(", ")}
- Period: ${userInputs.period || "see data"}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Identify the most expensive queries by bytes processed
2. Flag full table scans that should use partition filters
3. Identify users or projects with highest cost attribution
4. Suggest specific query optimizations
5. Calculate potential monthly savings from optimizations

At $6.25/TB on-demand pricing unless other rate in data.

[CLEANED BIGQUERY DATA FOLLOWS]
    `.trim(),
  },

  content_creator: {
    id: "content_creator",
    label: "Content Creator",
    icon: "▶",
    description: "YouTube analytics, social data, transcripts",
    normalizers: ["view_count", "duration", "engagement_rate"],
    piiTypes: ["email", "name"],
    reportLanguage: { rows: "content items", duplicates: "duplicate entries", reduction: "Analysis token reduction" },
    userInputFields: [
      { key: "platform",  label: "Platform",      placeholder: "e.g. YouTube, TikTok, Instagram" },
      { key: "dateRange", label: "Date range",    placeholder: "e.g. Jan–Dec 2025" },
    ],
    promptTemplate: (stats, userInputs) => `
You are a content strategy expert analyzing creator performance data.

CONTENT DATA SUMMARY:
- Items analyzed: ${stats.cleanedRowCount}
- Columns: ${(stats.headers || []).join(", ")}
- Platform: ${userInputs.platform || "see data"}
- Data quality: ${stats.qualityAfter}/100 after cleaning

YOUR TASK:
1. Identify the top 5 content themes by performance
2. Find patterns in titles, length, format that correlate with success
3. Identify the best posting times and frequencies
4. Suggest 10 specific content ideas based on top performers
5. Flag any content types consistently underperforming

[CLEANED CONTENT DATA FOLLOWS]
    `.trim(),
  },

  hr_people: {
    id: "hr_people",
    label: "HR & People Analytics",
    icon: "◐",
    description: "Employee surveys, attrition data, performance data",
    normalizers: ["rating_scale", "date_iso"],
    piiTypes: ["email", "name", "phone", "ssn", "dob", "address"],
    reportLanguage: { rows: "employee records", duplicates: "duplicate entries", reduction: "Analysis token reduction" },
    userInputFields: [
      { key: "focus", label: "Analysis focus", placeholder: "e.g. attrition risk, engagement, performance" },
    ],
    promptTemplate: (stats, userInputs) => `
You are an HR analytics expert. All data has been anonymized.

HR DATA SUMMARY:
- Records: ${stats.cleanedRowCount}
- Columns: ${(stats.headers || []).join(", ")}
- Focus area: ${userInputs.focus || "general analysis"}
- PII status: ${stats.piiMaskEnabled ? "masked" : "review before sharing"}
- Data quality: ${stats.qualityAfter}/100

YOUR TASK:
1. Identify key patterns in the data
2. Flag any concerning trends
3. Suggest actionable interventions
4. Note any data quality issues affecting analysis

Important: Present findings at aggregate level only.
Do not identify or reference individual employees.

[ANONYMIZED HR DATA FOLLOWS]
    `.trim(),
  },

  buy_decision: {
    id: "buy_decision",
    label: "BuyDecision AI",
    icon: "◈",
    description: "AI financial advisor — crypto, stocks, products",
    normalizers: ["currency", "ticker", "date_iso", "price"],
    piiTypes: ["email", "phone"],
    reportLanguage: { rows: "analyses", duplicates: "duplicate queries", reduction: "Analysis cost reduction" },
    userInputFields: [
      { key: "asset", label: "Asset or Product", placeholder: "e.g. Bitcoin, AAPL, MacBook Pro" },
      { key: "price", label: "Current Price (optional)", placeholder: "e.g. $45,000 or $185.50" },
      { key: "timeframe", label: "Investment Timeframe", placeholder: "e.g. 1 week, 3 months, long-term" },
    ],
    promptTemplate: (stats, userInputs) => `
You are BuyDecision AI, a financial advisor analyzing investment decisions.

IMPORTANT DISCLAIMER: This is analysis only, not financial advice. Past performance doesn't predict future results. Consult a qualified financial advisor before making investment decisions.

ANALYSIS REQUEST:
- Asset/Product: ${userInputs.asset || "[not specified]"}
- Current Price: ${userInputs.price || "fetching current price..."}
- Timeframe: ${userInputs.timeframe || "not specified"}

YOUR TASK:
1. Fetch current market data and price trends
2. Analyze recent news and sentiment
3. Provide a BUY / SELL / HOLD recommendation with confidence level
4. List 3 key reasons for the recommendation
5. Identify 3 risk factors to consider
6. Suggest an optimal entry price if buying
7. Set stop-loss and take-profit levels for traders

FORMAT:
- Decision: [BUY/SELL/HOLD] (Confidence: X/10)
- Reasoning: [3 bullet points]
- Risks: [3 bullet points]
- Entry/Exit: [specific price levels]

Remember: This is educational analysis only. Not financial advice.
    `.trim(),
  },
};

export type VerticalId = keyof typeof VERTICALS;
