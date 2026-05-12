export type MissionStatus =
  | "idle"
  | "running"
  | "blocked"
  | "complete"
  | "failed";

export type TimelineType =
  | "system"
  | "agent"
  | "workflow"
  | "approval"
  | "artifact"
  | "auth";

export type ArtifactType =
  | "summary"
  | "report"
  | "research"
  | "link"
  | "file"
  | "table"
  | "plan"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "screenshot";

export interface ExecutionContext {
  nodeId: string;
  taskId: string;
  agentId: string;
  currentUrl: string;
  authState: "none" | "required" | "complete";
  step: number;
  totalSteps: number;
}

export interface TimelineEvent {
  id: string;
  type: TimelineType;
  message: string;
  createdAt: number;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content?: string;
  url?: string;
  createdAt: number;
}

export interface Mission {
  id: string;
  title: string;
  goal: string;
  status: MissionStatus;
  createdAt: number;
  updatedAt: number;
  artifacts: Artifact[];
  timeline: TimelineEvent[];
  context: ExecutionContext;
  memory: Record<string, any>; // Mission memory system
}

export interface AgentRuntime {
  id: string;
  name: string;
  role: string;
  status: "idle" | "thinking" | "executing";
}
