// lib/master-slave-executor.ts
// Executes intelligent paths using master/slave node architecture

export type SlaveNodeType = 'ai_processing' | 'browser_action' | 'custom_logic' | 'user_interaction';

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'upload' | 'scrape' | 'fill_form' | 'wait' | 'screenshot' | 'submit';
  target?: string;
  value?: string | any;
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
  
  // Node type determines execution method
  type: SlaveNodeType;
  
  // AI processing (legacy - uses Claude API)
  prompt?: string;
  
  // Browser automation (NEW - $0 cost)
  browserAction?: BrowserAction;
  
  // Custom logic (NEW - $0 cost)
  customLogic?: {
    function: string;
    params: any;
  };
  
  // User interaction (NEW - pauses execution)
  userInteraction?: {
    type: 'await_login' | 'await_approval' | 'request_input';
    message: string;
  };
  
  // Execution results
  status: "pending" | "active" | "waiting_user" | "complete" | "failed";
  input?: any;
  output?: any;
  cost?: number;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface MasterNode {
  id: string;
  taskType: string;
  taskName: string;
  goal: string;
  context: string;
  slaveNodes: SlaveNode[];
  totalCost: number;
  status: "planning" | "executing" | "complete" | "failed";
}

/**
 * Convert intelligent path to master/slave node structure
 */
export function pathToMasterSlave(path: any, userInput: string): MasterNode {
  const master: MasterNode = {
    id: `master_${Date.now()}`,
    taskType: path.taskType,
    taskName: path.detectedIntent,
    goal: userInput,
    context: `${path.startingPoint} → ${path.endingPoint}`,
    slaveNodes: [],
    totalCost: 0,
    status: "planning",
  };

  // Convert each path step to a slave node
  master.slaveNodes = path.steps.map((step: any, index: number) => ({
    id: `slave_${Date.now()}_${index}`,
    name: step.title,
    description: step.description,
    type: 'ai_processing' as SlaveNodeType,
    prompt: buildSlavePrompt(step, userInput, path),
    status: index === 0 ? ("active" as const) : ("pending" as const),
    input: null,
    output: null,
    cost: 0,
  }));

  return master;
}

/**
 * Build optimized prompt for each slave node
 */
function buildSlavePrompt(step: any, userInput: string, path: any): string {
  return `You are a specialized AI agent handling: ${step.title}

USER'S GOAL: ${userInput}

YOUR TASK: ${step.action}

CONTEXT:
- Starting point: ${path.startingPoint}
- End goal: ${path.endingPoint}
- Current step: ${step.order} of ${path.steps.length}

EXPECTED OUTPUT: ${step.expectedOutcome}

INSTRUCTIONS:
${step.description}

${step.aiAssistance}

Please execute this task now and provide the output in a structured format.`;
}

/**
 * Execute a single slave node based on its type
 */
export async function executeSlaveNode(
  node: SlaveNode,
  apiKey: string,
  extensionConnectionId?: string
): Promise<SlaveNode> {
  const updatedNode = { 
    ...node, 
    status: "active" as const,
    startTime: Date.now()
  };

  try {
    switch (node.type) {
      case 'browser_action':
        return await executeBrowserActionNode(updatedNode, extensionConnectionId);
      
      case 'custom_logic':
        return await executeCustomLogicNode(updatedNode);
      
      case 'user_interaction':
        return await executeUserInteractionNode(updatedNode);
      
      case 'ai_processing':
      default:
        return await executeAIProcessingNode(updatedNode, apiKey);
    }
  } catch (error) {
    return {
      ...updatedNode,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      endTime: Date.now()
    };
  }
}

/**
 * Execute browser action node with AI Vision (NO TEMPLATES)
 */
async function executeBrowserActionNode(
  node: SlaveNode,
  extensionConnectionId?: string
): Promise<SlaveNode> {
  if (!extensionConnectionId) {
    throw new Error('No browser extension connected');
  }

  // Use AI Vision instead of hardcoded actions
  const { executeBrowserAction } = await import('@/lib/browser-sse');

  // Send AI Vision command to extension
  await executeBrowserAction(
    extensionConnectionId,
    {
      type: 'ai_vision_task',
      goal: node.description || node.name,
      maxSteps: 50,
      slaveId: node.id
    },
    node.id,
    '' // masterId set by caller
  );

  // Result comes back via WebSocket asynchronously
  return {
    ...node,
    status: "active", // Will update to complete when extension responds
    cost: 0, // Will update with actual Vision API cost
    endTime: Date.now()
  };
}

/**
 * Execute custom logic node ($0 cost)
 */
async function executeCustomLogicNode(node: SlaveNode): Promise<SlaveNode> {
  if (!node.customLogic) {
    throw new Error('Custom logic not defined');
  }

  // Execute custom function
  let result;
  
  switch (node.customLogic.function) {
    case 'parse_resume':
      result = parseResume(node.customLogic.params);
      break;
    
    case 'scrape_data':
      result = scrapeData(node.customLogic.params);
      break;
    
    case 'validate_form':
      result = validateForm(node.customLogic.params);
      break;
    
    case 'calculate':
      result = calculate(node.customLogic.params);
      break;
    
    default:
      throw new Error(`Unknown custom function: ${node.customLogic.function}`);
  }

  return {
    ...node,
    status: "complete",
    output: result,
    cost: 0, // Custom logic is FREE
    endTime: Date.now()
  };
}

/**
 * Execute user interaction node (waits for user)
 */
async function executeUserInteractionNode(node: SlaveNode): Promise<SlaveNode> {
  if (!node.userInteraction) {
    throw new Error('User interaction not defined');
  }

  // Mark as waiting for user
  return {
    ...node,
    status: "waiting_user",
    cost: 0,
    output: {
      message: node.userInteraction.message,
      type: node.userInteraction.type
    }
  };
}

/**
 * Execute AI processing node (uses Claude API - PAID)
 */
async function executeAIProcessingNode(
  node: SlaveNode,
  apiKey: string
): Promise<SlaveNode> {
  if (!node.prompt) {
    throw new Error('AI prompt not defined');
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: node.prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    const output = data.content[0].text;

    // Calculate cost
    const inputTokens = data.usage.input_tokens;
    const outputTokens = data.usage.output_tokens;
    const cost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return {
      ...node,
      output,
      cost,
      status: "complete",
      endTime: Date.now()
    };
  } catch (error) {
    return {
      ...node,
      status: "failed",
      output: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      cost: 0,
      endTime: Date.now()
    };
  }
}

/**
 * Execute entire master node (all slave nodes in sequence)
 */
export async function executeMasterNode(
  master: MasterNode,
  apiKey: string,
  onNodeUpdate?: (node: SlaveNode) => void
): Promise<MasterNode> {
  const updatedMaster: MasterNode = { ...master, status: "executing" };
  let totalCost = 0;

  for (let i = 0; i < updatedMaster.slaveNodes.length; i++) {
    const node = updatedMaster.slaveNodes[i];
    
    // Execute node
    const executedNode = await executeSlaveNode(node, apiKey);
    updatedMaster.slaveNodes[i] = executedNode;
    totalCost += executedNode.cost || 0;

    // Notify UI of update
    if (onNodeUpdate) {
      onNodeUpdate(executedNode);
    }

    // If node failed, stop execution
    if (executedNode.status === "failed") {
      updatedMaster.status = "failed";
      break;
    }

    // Activate next node
    if (i < updatedMaster.slaveNodes.length - 1) {
      updatedMaster.slaveNodes[i + 1].status = "active";
    }
  }

  updatedMaster.totalCost = totalCost;
  updatedMaster.status = updatedMaster.status === "failed" ? "failed" : "complete";

  return updatedMaster;
}

/**
 * SKILL-SPECIFIC EXECUTORS
 * These follow the standards from each skill file
 */

/**
 * Execute data analysis task (follows data-analysis skill standards)
 */
export async function executeDataAnalysis(
  userInput: string,
  fileData: any,
  apiKey: string
): Promise<MasterNode> {
  const master: MasterNode = {
    id: `master_${Date.now()}`,
    taskType: "analyze_data",
    taskName: "Data Analysis",
    goal: userInput,
    context: "CSV/Excel data analysis",
    slaveNodes: [
      {
        id: "slave_1",
        name: "Data Understanding",
        description: "Load and profile the dataset",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Analyze this dataset and provide:
1. Number of rows and columns
2. Column names and data types
3. Missing values summary
4. Basic statistics

Data: ${JSON.stringify(fileData).slice(0, 5000)}`,
        status: "active" as const,
      },
      {
        id: "slave_2",
        name: "Data Cleaning",
        description: "Handle missing values and outliers",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Based on the profiling, clean this data:
1. Identify rows with missing values
2. Suggest imputation strategies
3. Detect outliers using IQR method
4. Provide cleaned dataset summary`,
        status: "pending" as const,
      },
      {
        id: "slave_3",
        name: "Exploratory Analysis",
        description: "Find patterns and correlations",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Perform exploratory analysis:
1. Calculate correlation matrix
2. Identify top 3 strongest correlations
3. Detect trends over time (if applicable)
4. Find anomalies or interesting patterns`,
        status: "pending" as const,
      },
      {
        id: "slave_4",
        name: "Visualization",
        description: "Create charts and graphs",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Design visualizations:
1. Recommend 3-5 chart types for key insights
2. Provide chart specifications (axes, colors, labels)
3. Describe what each chart reveals
4. Suggest interactive elements`,
        status: "pending" as const,
      },
      {
        id: "slave_5",
        name: "Insights & Recommendations",
        description: "Generate actionable insights",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Synthesize findings into:
1. Top 3 key insights
2. Business implications
3. Recommended actions
4. Areas for further investigation`,
        status: "pending" as const,
      },
    ],
    totalCost: 0,
    status: "planning",
  };

  return await executeMasterNode(master, apiKey);
}

/**
 * Execute code generation (follows code skill standards)
 */
export async function executeCodeGeneration(
  userInput: string,
  apiKey: string
): Promise<MasterNode> {
  const master: MasterNode = {
    id: `master_${Date.now()}`,
    taskType: "generate_code",
    taskName: "Code Generation",
    goal: userInput,
    context: "Full-stack code generation",
    slaveNodes: [
      {
        id: "slave_1",
        name: "Requirements Analysis",
        description: "Parse and clarify requirements",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Analyze this coding request: "${userInput}"

Provide:
1. List of functional requirements
2. Non-functional requirements (performance, security)
3. Edge cases to handle
4. Assumptions made

Be specific and technical.`,
        status: "active" as const,
      },
      {
        id: "slave_2",
        name: "Architecture Design",
        description: "Choose tech stack and patterns",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Design the architecture:
1. Recommended language and framework
2. Design patterns to use
3. Data structures
4. File structure
5. External dependencies

Justify each choice.`,
        status: "pending" as const,
      },
      {
        id: "slave_3",
        name: "Implementation",
        description: "Write production-ready code",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Write the complete code:
1. Use best practices (DRY, SOLID)
2. Add comprehensive error handling
3. Include type hints/annotations
4. Add inline comments for complex logic
5. Follow language style guide

Provide complete, runnable code.`,
        status: "pending" as const,
      },
      {
        id: "slave_4",
        name: "Testing",
        description: "Generate test suite",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Create comprehensive tests:
1. Unit tests for each function
2. Integration tests for workflows
3. Edge case tests
4. Performance tests (if applicable)

Aim for 90%+ coverage.`,
        status: "pending" as const,
      },
      {
        id: "slave_5",
        name: "Documentation",
        description: "Write usage guide",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Create documentation:
1. README with setup instructions
2. API reference
3. Usage examples
4. Common issues and solutions

Make it beginner-friendly.`,
        status: "pending" as const,
      },
    ],
    totalCost: 0,
    status: "planning",
  };

  return await executeMasterNode(master, apiKey);
}

/**
 * Execute content writing (follows writing skill standards)
 */
export async function executeContentWriting(
  userInput: string,
  apiKey: string
): Promise<MasterNode> {
  const master: MasterNode = {
    id: `master_${Date.now()}`,
    taskType: "write_content",
    taskName: "Content Writing",
    goal: userInput,
    context: "SEO-optimized content creation",
    slaveNodes: [
      {
        id: "slave_1",
        name: "Audience & Angle",
        description: "Define target audience and approach",
        type: "ai_processing" as SlaveNodeType,
        prompt: `For this content: "${userInput}"

Define:
1. Target audience (demographics, pain points)
2. Unique angle or hook
3. Desired tone and voice
4. Competitor gaps to fill`,
        status: "active" as const,
      },
      {
        id: "slave_2",
        name: "Research & Outline",
        description: "Research topic and create structure",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Research and outline:
1. Identify 10-15 target keywords
2. Analyze top 5 competing articles
3. Find unique data points or insights
4. Create detailed outline with H2/H3 structure`,
        status: "pending" as const,
      },
      {
        id: "slave_3",
        name: "Draft Writing",
        description: "Write engaging first draft",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Write the content:
1. Compelling introduction with hook
2. Well-structured body with examples
3. Strong conclusion with CTA
4. 1500-2000 words
5. Conversational yet authoritative tone`,
        status: "pending" as const,
      },
      {
        id: "slave_4",
        name: "SEO Optimization",
        description: "Optimize for search engines",
        type: "ai_processing" as SlaveNodeType,
        prompt: `SEO optimization:
1. Place keywords naturally (1-2% density)
2. Optimize headings with keywords
3. Write meta description (155 chars)
4. Suggest internal linking opportunities
5. Add schema markup recommendations`,
        status: "pending" as const,
      },
      {
        id: "slave_5",
        name: "Final Polish",
        description: "Edit and refine",
        type: "ai_processing" as SlaveNodeType,
        prompt: `Polish the content:
1. Fix grammar and spelling
2. Improve clarity and flow
3. Strengthen weak paragraphs
4. Verify facts and statistics
5. Ensure readability (Grade 8-10 level)`,
        status: "pending" as const,
      },
    ],
    totalCost: 0,
    status: "planning",
  };

  return await executeMasterNode(master, apiKey);
}


// ============================================
// CUSTOM LOGIC FUNCTIONS (FREE - $0 cost)
// ============================================

/**
 * Parse resume to extract user data
 */
function parseResume(params: any): any {
  const { resumeText } = params;
  
  // Extract data using regex (no AI needed)
  const emailRegex = /[\w.-]+@[\w.-]+\.\w+/;
  const phoneRegex = /(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  const nameRegex = /^([A-Z][a-z]+ [A-Z][a-z]+)/m;
  
  return {
    name: resumeText.match(nameRegex)?.[1] || '',
    email: resumeText.match(emailRegex)?.[0] || '',
    phone: resumeText.match(phoneRegex)?.[0] || '',
    // Add more fields as needed
  };
}

/**
 * Scrape data from HTML
 */
function scrapeData(params: any): any {
  const { html, selector } = params;
  
  // Use DOM parsing (would be done in browser, this is a stub)
  return {
    scraped: true,
    selector,
    // Actual scraping done by browser extension
  };
}

/**
 * Validate form data
 */
function validateForm(params: any): any {
  const { formData } = params;
  const errors = [];
  
  // Email validation
  if (formData.email && !/@/.test(formData.email)) {
    errors.push('Invalid email format');
  }
  
  // Phone validation
  if (formData.phone && !/\d{10}/.test(formData.phone.replace(/\D/g, ''))) {
    errors.push('Invalid phone number');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Perform calculations
 */
function calculate(params: any): any {
  const { operation, values } = params;
  
  switch (operation) {
    case 'sum':
      return values.reduce((a: number, b: number) => a + b, 0);
    case 'average':
      return values.reduce((a: number, b: number) => a + b, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}