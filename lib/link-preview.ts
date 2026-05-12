// lib/link-preview.ts
// Extract rich previews from URLs in node content

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  price?: string;
  brand?: string;
  type?: "product" | "article" | "video" | "general";
}

/**
 * Extract URLs from text
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

/**
 * Detect if URL is likely a product page
 */
function isProductUrl(url: string): boolean {
  const productIndicators = [
    "amazon.com/",
    "ebay.com/",
    "etsy.com/",
    "walmart.com/",
    "target.com/",
    "bestbuy.com/",
    "nike.com/",
    "adidas.com/",
    "/product/",
    "/item/",
    "/p/",
  ];
  return productIndicators.some(indicator => url.toLowerCase().includes(indicator));
}

/**
 * Extract brand from URL
 */
function extractBrand(url: string): string | undefined {
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    const brandMap: Record<string, string> = {
      "amazon.com": "Amazon",
      "ebay.com": "eBay",
      "etsy.com": "Etsy",
      "walmart.com": "Walmart",
      "target.com": "Target",
      "bestbuy.com": "Best Buy",
      "nike.com": "Nike",
      "adidas.com": "Adidas",
      "apple.com": "Apple",
      "samsung.com": "Samsung",
    };
    
    for (const [key, brand] of Object.entries(brandMap)) {
      if (domain.includes(key)) return brand;
    }
    
    // Fallback: capitalize domain
    return domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
  } catch {
    return undefined;
  }
}

/**
 * Extract price from text (common formats)
 */
function extractPrice(text: string): string | undefined {
  const priceRegex = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/;
  const match = text.match(priceRegex);
  return match ? `$${match[1]}` : undefined;
}

/**
 * Generate mock preview from URL (client-side)
 * In production, this would call a server endpoint that fetches Open Graph data
 */
export function generatePreview(url: string, content: string = ""): LinkPreview {
  const isProduct = isProductUrl(url);
  const brand = extractBrand(url);
  const price = extractPrice(content);
  
  // Extract title from URL path
  const urlPath = new URL(url).pathname;
  const titleFromPath = urlPath
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/-/g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    url,
    title: titleFromPath,
    description: content.slice(0, 150),
    brand,
    price,
    type: isProduct ? "product" : "general",
    // Note: Real implementation would fetch actual images via server-side API
    image: undefined, 
  };
}

/**
 * Extract all previews from node content
 */
export function extractPreviews(content: string): LinkPreview[] {
  const urls = extractUrls(content);
  return urls.map(url => generatePreview(url, content));
}
