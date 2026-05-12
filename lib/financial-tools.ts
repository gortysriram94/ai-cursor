// lib/financial-tools.ts
// Financial tools for BuyDecision AI - crypto prices, stock data, news

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const JINA_READER_BASE = "https://r.jina.ai/http://";

// ── Types ───────────────────────────────────────────────────────────────────────

export interface PriceData {
  symbol: string;
  name: string;
  price: number;
  currency: string;
  change24h: number;
  changePct24h: number;
  volume24h?: number;
  marketCap?: number;
  lastUpdated: string;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
}

export interface AnalysisResult {
  asset: string;
  currentPrice: number;
  recommendation: "BUY" | "SELL" | "HOLD";
  confidence: number; // 1-10
  reasons: string[];
  risks: string[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  sources: string[];
}

// ── CoinGecko Crypto Prices (FREE, no API key) ────────────────────────────────

export async function getCryptoPrice(symbol: string): Promise<PriceData | null> {
  try {
    // Map common symbols to CoinGecko IDs
    const symbolMap: Record<string, string> = {
      "BTC": "bitcoin", "BITCOIN": "bitcoin",
      "ETH": "ethereum", "ETHEREUM": "ethereum",
      "SOL": "solana", "SOLANA": "solana",
      "BNB": "binancecoin",
      "XRP": "ripple",
      "ADA": "cardano",
      "DOGE": "dogecoin",
      "DOT": "polkadot",
      "AVAX": "avalanche-2",
      "LINK": "chainlink",
      "MATIC": "matic-network",
    };

    const coinId = symbolMap[symbol.toUpperCase()] || symbol.toLowerCase();

    const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    const res = await fetch(url, { next: { revalidate: 60 } }); // Cache for 60s

    if (!res.ok) {
      console.error(`CoinGecko error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const coin = data[coinId];

    if (!coin) return null;

    return {
      symbol: symbol.toUpperCase(),
      name: coinId.charAt(0).toUpperCase() + coinId.slice(1),
      price: coin.usd,
      currency: "USD",
      change24h: coin.usd_24h_change || 0,
      changePct24h: coin.usd_24h_change || 0,
      volume24h: coin.usd_24h_vol,
      marketCap: coin.usd_market_cap,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching crypto price:", error);
    return null;
  }
}

export async function getCryptoMarketData(symbol: string): Promise<string> {
  const price = await getCryptoPrice(symbol);
  if (!price) return `Unable to fetch price data for ${symbol}.`;

  return `
CRYPTO MARKET DATA: ${price.name} (${price.symbol})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current Price:    $${price.price.toLocaleString()}
24h Change:       ${price.change24h >= 0 ? "+" : ""}$${price.change24h.toFixed(2)} (${price.changePct24h >= 0 ? "+" : ""}${price.changePct24h.toFixed(2)}%)
24h Volume:       $${price.volume24h?.toLocaleString() || "N/A"}
Market Cap:       $${price.marketCap?.toLocaleString() || "N/A"}
Last Updated:     ${new Date(price.lastUpdated).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
}

// ── Jina Read for News/Articles ───────────────────────────────────────────────

export async function fetchFinancialNews(query: string): Promise<string> {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + " crypto stock news")}&tbm=nws`;
    const jinaUrl = `https://r.jina.ai/${searchUrl}`;

    const res = await fetch(jinaUrl, {
      headers: {
        "Accept": "application/json",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      return `Unable to fetch news for "${query}".`;
    }

    const data = await res.json();
    return data.content || data.text || "No news content found.";
  } catch (error) {
    console.error("Error fetching financial news:", error);
    return `Error fetching news: ${error}`;
  }
}

// ── Product Search (via Jina Read) ────────────────────────────────────────────

export async function fetchProductInfo(productName: string): Promise<string> {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(productName + " review specs price")}`;
    const jinaUrl = `https://r.jina.ai/${searchUrl}`;

    const res = await fetch(jinaUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 600 }, // Cache for 10 minutes
    });

    if (!res.ok) {
      return `Unable to fetch product info for "${productName}".`;
    }

    const data = await res.json();
    return data.content || data.text || "No product info found.";
  } catch (error) {
    console.error("Error fetching product info:", error);
    return `Error fetching product info: ${error}`;
  }
}

// ── Stock Price (via Yahoo Finance scraping with Jina) ───────────────────────

export async function getStockPrice(symbol: string): Promise<string> {
  try {
    // Use Yahoo Finance via Jina Read
    const yahooUrl = `https://finance.yahoo.com/quote/${symbol.toUpperCase()}`;
    const jinaUrl = `https://r.jina.ai/${yahooUrl}`;

    const res = await fetch(jinaUrl, {
      headers: { "Accept": "application/json" },
      next: { revalidate: 60 }, // Cache for 60s
    });

    if (!res.ok) {
      return `Unable to fetch stock price for ${symbol}.`;
    }

    const data = await res.json();
    return `
STOCK DATA: ${symbol.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.content || data.text || "No data available."}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
  } catch (error) {
    console.error("Error fetching stock price:", error);
    return `Error fetching stock price: ${error}`;
  }
}

// ── Comprehensive Analysis Helper ─────────────────────────────────────────────

export async function gatherAssetData(asset: string): Promise<string> {
  const results: string[] = [];

  // Try crypto first
  const cryptoData = await getCryptoMarketData(asset);
  if (!cryptoData.includes("Unable to fetch")) {
    results.push(cryptoData);
  }

  // Try stock
  const stockData = await getStockPrice(asset);
  if (!stockData.includes("Unable to fetch")) {
    results.push(stockData);
  }

  // Fetch recent news
  const newsData = await fetchFinancialNews(asset);
  results.push(`\nRECENT NEWS:\n${newsData}`);

  return results.join("\n\n");
}

// ── Export for agent tools ─────────────────────────────────────────────────────

export const FINANCIAL_TOOLS = {
  getCryptoPrice,
  getCryptoMarketData,
  fetchFinancialNews,
  fetchProductInfo,
  getStockPrice,
  gatherAssetData,
};
