export interface Plugin {
  id: string;
  name: string;
  description: string; // used in AI system prompt
  icon: string;
  category: "browse" | "ai" | "data" | "communication" | "utility";
  requiresCredential?: string; // label shown in settings
}

export interface AgentStep {
  id: string;
  pluginId: string;
  description: string;
  status: "pending" | "running" | "done" | "error";
  result?: string;
}

export const PLUGINS: Plugin[] = [
  {
    id: "search",
    name: "Web Search",
    description: "Search the internet for current information, news, facts, or research",
    icon: "🔍",
    category: "browse",
  },
  {
    id: "browse",
    name: "Web Browse",
    description: "Visit a URL and extract its content, text, links, or structured data",
    icon: "🌐",
    category: "browse",
    requiresCredential: "Chrome Extension",
  },
  {
    id: "ai",
    name: "AI Process",
    description: "Analyze, summarize, compare, classify, translate, or generate content with AI",
    icon: "✨",
    category: "ai",
  },
  {
    id: "http",
    name: "HTTP Request",
    description: "Call any REST API endpoint with custom headers, body, and authentication",
    icon: "⚡",
    category: "utility",
  },
  {
    id: "export",
    name: "Export",
    description: "Save and download results as CSV, JSON, Markdown, or PDF",
    icon: "📥",
    category: "utility",
  },
];

export const PLUGIN_SYSTEM_CONTEXT = `You have access to these plugins:
${PLUGINS.map(p => `- ${p.name} (${p.id}): ${p.description}`).join("\n")}

When executing a task, briefly mention which plugins you're using and why.`;

export function getPlugin(id: string): Plugin | undefined {
  return PLUGINS.find(p => p.id === id);
}

// Client-side inference — shown before the AI responds
export function inferPlugins(task: string): Plugin[] {
  const t = task.toLowerCase();
  const picked = new Set<string>();

  if (/search|find|look up|research|what is|who is|latest|news|current|recent/.test(t))
    picked.add("search");

  if (/visit|go to|scrape|extract from|read|check|url|http|website|page|site/.test(t))
    picked.add("browse");

  if (/api|request|post|get|endpoint|webhook|call/.test(t))
    picked.add("http");

  if (/save|export|download|csv|json|pdf|file|report|spreadsheet/.test(t))
    picked.add("export");

  // AI is always included
  picked.add("ai");

  return PLUGINS.filter(p => picked.has(p.id));
}
