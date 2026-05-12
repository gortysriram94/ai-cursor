// lib/agents/types.ts
// Shared types for the TokenLift agent orchestration system.

export type AgentName =
  | "triage"
  | "navigator"
  | "approver"
  | "searcher"
  | "filter"
  | "action_executor"
  | "gateway"
  | "scraper"
  | "coder"
  | "content_architect"
  | "sync"
  | "validator";

export interface AgentEvent {
  type:
    | "agent_start"
    | "agent_text"
    | "agent_tool_call"
    | "agent_tool_result"
    | "agent_handoff"
    | "agent_approval"
    | "agent_tokens"        // token usage + cost from one Anthropic call
    | "browser_navigate"
    | "browser_click"
    | "browser_type"
    | "browser_read"
    | "agent_done"
    | "agent_error"
    | "agent_decision";    // agent found multiple options — user must pick one
  nodeId:            string;
  agent?:            AgentName;
  text?:             string;
  tool?:             string;
  toolCallId?:       string;
  input?:            Record<string, unknown>;
  result?:           string;
  nextAgent?:        AgentName;
  context?:          string;          // summary of previous agent's work, passed to next agent
  url?:              string;
  selector?:         string;
  value?:            string;
  approval?:         ApprovalRequest;
  summary?:          string;
  steps?:            number;
  error?:            string;
  // decision event fields
  prompt?:           string;
  options?:          Array<{ id:string; title:string; subtitle?:string; thumbnail?:string; url:string; badge?:string }>;
  // token tracking
  input_tokens?:     number;
  output_tokens?:    number;
  cache_read_tokens?: number;
  cost_usd?:         number;
}

export interface ApprovalRequest {
  id:          string;
  nodeId:      string;  // canvas node that owns this approval
  title:       string;
  description: string;
  action:      string;  // what will happen if approved
  risk:        "low" | "medium" | "high";
}

export interface AgentContext {
  task:         string;
  nodeId:       string;
  url?:         string;        // current browser URL
  pageText?:    string;        // last read page content
  location?:    string;        // "San Francisco, CA, USA" — injected from browser geolocation
  memory:       Record<string, string>;
  history:      Array<{ role: "user" | "assistant"; content: string }>;
  namedAttrs:   Record<string, string>;  // scraper output
}

export type SendFn = (event: AgentEvent) => void;