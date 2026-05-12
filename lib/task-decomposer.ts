// lib/task-decomposer.ts
// Kimi K2-powered task decomposer (server-side).
// Analyzes a user task and returns a structured swarm plan:
// how many nodes to spawn, what each does, which model handles it.

export type NodeModel = "kimi" | "dracarys";
export type NodeType  = "search" | "browser" | "analyze" | "synthesize" | "code" | "plan" | "write";

export interface SwarmNodeSpec {
  title:    string;          // short display title
  model:    NodeModel;       // which model runs this node
  mode:     "agent" | "ask"; // agent = multi-step, ask = single response
  type:     NodeType;
  tasks:    string[];        // 1–3 focused sub-tasks
  parallel?: boolean;        // can run alongside the previous node
}

export interface SwarmPlan {
  nodes:     SwarmNodeSpec[];
  reasoning: string;
}

const SYSTEM = `You are a swarm orchestrator for a multi-agent AI canvas called Pushpa.

Given a user task, decompose it into 1–5 specialized agent nodes. Design each node like a microservice — focused on 1–3 tasks with a single clear responsibility.

MODEL ROUTING RULES (critical):
- Use "kimi" for: research analysis, text summarization, writing, planning, data extraction from provided text, coding, reasoning
- Use "dracarys" for: anything requiring LIVE web browsing, clicking buttons, filling forms, navigating pages, web search

NODE COUNT RULES:
- Simple tasks (single action): 1 node
- Medium tasks (search + analyze): 2 nodes
- Complex tasks (search + act + summarize): 3 nodes
- Very complex (e.g. apply to 10 jobs): 4–5 nodes

PARALLEL RULES (critical for performance):
- If a task has multiple INDEPENDENT sub-goals (e.g. "find X AND find Y AND find Z"), each sub-goal = its own node with parallel:true
- parallel:true  = this node has NO dependency on other nodes, runs simultaneously
- parallel:false = this node NEEDS output from a previous node before starting (e.g. a synthesis node that summarizes all results)
- When in doubt, default to parallel:true — independent work is always faster in parallel

TYPE VALUES: "search" | "browser" | "analyze" | "synthesize" | "code" | "plan" | "write"

Return ONLY valid JSON — no markdown fences, no explanation outside the JSON:
{
  "nodes": [
    {
      "title": "Find PM Jobs",
      "model": "dracarys",
      "mode": "agent",
      "type": "search",
      "tasks": ["Search greenhouse.io and lever.co for Product Manager roles", "Extract job titles, companies, and apply URLs"],
      "parallel": true
    }
  ],
  "reasoning": "one sentence explaining the decomposition"
}`;

function parseSwarmPlan(raw: string): SwarmPlan {
  console.log(`[TaskDecomposer] Parsing raw response: ${raw.slice(0, 150)}...`);
  const cleaned = raw
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  // Non-greedy match: find the first complete JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error(`[TaskDecomposer] No JSON found in response. Raw: ${raw.slice(0, 300)}`);
    throw new Error("No JSON object found in decomposer response");
  }
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    console.error(`[TaskDecomposer] Invalid plan - no nodes. Parsed:`, parsed);
    throw new Error("Invalid swarm plan — no nodes");
  }
  // Validate and normalise each node
  const nodes: SwarmNodeSpec[] = parsed.nodes.map((n: any, i: number) => ({
    title:    String(n.title ?? `Node ${i + 1}`),
    model:    n.model === "claude" ? "dracarys" : "kimi",
    mode:     n.mode === "agent" ? "agent" : "ask",
    type:     n.type ?? "analyze",
    tasks:    Array.isArray(n.tasks) ? n.tasks.slice(0, 3).map(String) : [String(n.tasks ?? "Complete task")],
    parallel: !!n.parallel,
  }));
  nodes.forEach((node, i) => {
    console.log(`[TaskDecomposer] Node ${i+1} | Model: ${node.model === "kimi" ? "Kimi K2" : "Dracarys Llama 3.1 70B"} | Task: ${node.title}`);
  });
  return { nodes, reasoning: String(parsed.reasoning ?? "") };
}

export async function decomposeTask(task: string, location?: string): Promise<SwarmPlan> {
  const locLine = location ? `\nUser location: ${location}. Include location in search queries where relevant.` : "";
  console.log(`[TaskDecomposer] Decomposing task with Kimi K2: ${task.slice(0, 50)}...`);
  try {
    // Dynamic import to avoid bundling kimi-server.ts for client
    const { kimiComplete } = await import("./agents/kimi-server");
    const { text } = await kimiComplete(
      SYSTEM,
      [{ role: "user", content: `Decompose this task into agent nodes:\n\n"${task}"${locLine}` }],
      1024,
    );
    console.log(`[TaskDecomposer] Kimi response: ${text.slice(0, 200)}...`);
    return parseSwarmPlan(text);
  } catch (err) {
    console.error(`[TaskDecomposer] Decomposition failed:`, err);
    throw err;
  }
}

// Fallback single-node plan when decomposer fails or Puter isn't available
export function singleNodePlan(task: string): SwarmPlan {
  const needsBrowser = /\b(open|click|navigate|browse|apply|buy|search|find|go to|visit)\b/i.test(task);
  console.log(`[TaskDecomposer] Single node plan: Model: ${needsBrowser ? "Dracarys Llama 3.1 70B" : "Kimi K2"} | Task: ${task.slice(0, 50)}`);
  return {
    nodes: [{
      title:    task.slice(0, 35),
      model:    needsBrowser ? "dracarys" : "kimi",
      mode:     "agent",
      type:     needsBrowser ? "browser" : "analyze",
      tasks:    [task],
      parallel: true,
    }],
    reasoning: "Single node — task too simple to decompose",
  };
}
