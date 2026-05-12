// chrome-extension/types/index.ts
// Production-grade TypeScript types for browser automation

export type BrowserActionType = 
  | 'navigate'
  | 'click'
  | 'type'
  | 'upload'
  | 'scroll'
  | 'wait'
  | 'scrape'
  | 'screenshot'
  | 'fill_form'
  | 'submit';

export type SlaveNodeType = 
  | 'browser_action'
  | 'custom_logic'
  | 'ai_processing'
  | 'user_interaction';

export type SlaveStatus = 
  | 'pending'
  | 'active'
  | 'waiting_user'
  | 'complete'
  | 'failed';

export interface BrowserAction {
  type: BrowserActionType;
  target?: string;        // CSS selector or URL
  value?: string | File;  // Text to type, file to upload
  options?: {
    timeout?: number;
    waitForNavigation?: boolean;
    scrollIntoView?: boolean;
  };
}

export interface SlaveNode {
  id: string;
  name: string;
  description: string;
  type: SlaveNodeType;
  status: SlaveStatus;
  
  // Browser automation
  browserAction?: BrowserAction;
  
  // Custom logic
  customLogic?: {
    function: string;  // Function name to execute
    params: any;
  };
  
  // AI processing
  aiProcessing?: {
    model: string;
    prompt: string;
    cost: number;
  };
  
  // User interaction
  userInteraction?: {
    type: 'await_login' | 'await_approval' | 'request_input';
    message: string;
  };
  
  // Execution results
  output?: any;
  error?: string;
  cost: number;
  startTime?: number;
  endTime?: number;
}

export interface MasterNode {
  id: string;
  taskName: string;
  goal: string;
  slaveNodes: SlaveNode[];
  status: 'planning' | 'executing' | 'paused' | 'complete' | 'failed';
  totalCost: number;
  startTime: number;
  endTime?: number;
}

export interface WebSocketMessage {
  type: 'execute_action' | 'action_result' | 'status_update' | 'error' | 'auth_required' | 'preview_data';
  payload: any;
  slaveId?: string;
  masterId?: string;
  timestamp: number;
}

export interface AuthState {
  needsAuth: boolean;
  site?: string;
  message?: string;
  loginUrl?: string;
}

export interface SiteHandler {
  name: string;
  detect: (url: string) => boolean;
  canHandle: (action: BrowserActionType) => boolean;
  execute: (action: BrowserAction) => Promise<ExecutionResult>;
  getSelectors: () => SiteSelectors;
}

export interface SiteSelectors {
  [key: string]: string;  // Map of semantic names to CSS selectors
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  cost: number;
  duration: number;
}

export interface FormField {
  name: string;
  type: 'text' | 'email' | 'tel' | 'file' | 'select' | 'checkbox' | 'radio';
  selector: string;
  value: string | File;
  required: boolean;
}

export interface FormData {
  fields: FormField[];
  submitButton: string;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  resume?: File;
  coverLetter?: string;
  workAuthorization?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

export interface ExtensionConfig {
  wsUrl: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  actionTimeout: number;
  debug: boolean;
}

export interface ExtensionState {
  connected: boolean;
  currentMaster?: MasterNode;
  currentSlave?: SlaveNode;
  userProfile?: UserProfile;
  authStates: Map<string, AuthState>;
}
