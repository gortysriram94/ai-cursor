// lib/task-handlers.ts
// Functional implementations for all TokenLift use cases

export type TaskType = 
  | "job_application"
  | "analyze_data"
  | "write_content"
  | "generate_code"
  | "build_apps"
  | "research_topics"
  | "create_reports"
  | "draft_emails"
  | "plan_strategies"
  | "debug_code"
  | "design_systems"
  | "optimize_workflows"
  | "audit_costs"
  | "shop_search"
  | "web_search"
  | "media_search";

export interface TaskHandler {
  type: TaskType;
  name: string;
  description: string;
  icon: string;
  creditCost: number;
  handler: (input: string) => TaskPlan;
}

export interface TaskPlan {
  taskName: string;
  goal: string;
  slaveNodes: Array<{
    id: string;
    name: string;
    description: string;
    expectedOutput?: string;
  }>;
}

// All task handlers
export const TASK_HANDLERS: Record<TaskType, TaskHandler> = {
  job_application: {
    type: "job_application",
    name: "Job Application",
    description: "Apply to jobs on LinkedIn, Indeed, etc.",
    icon: "💼",
    creditCost: 10,
    handler: (input: string) => ({
      taskName: "Job Application",
      goal: `Apply to jobs: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Navigate to Job Site",
          description: "Open LinkedIn/Indeed and navigate to jobs page",
          expectedOutput: "Job search page loaded",
        },
        {
          id: "slave_2",
          name: "Search for Jobs",
          description: "Search for matching positions based on criteria",
          expectedOutput: "List of relevant job postings",
        },
        {
          id: "slave_3",
          name: "Filter & Select",
          description: "Filter by Easy Apply and select target jobs",
          expectedOutput: "List of jobs ready to apply",
        },
        {
          id: "slave_4",
          name: "Fill Applications",
          description: "Auto-fill application forms with resume data",
          expectedOutput: "Application forms completed",
        },
        {
          id: "slave_5",
          name: "Submit Applications",
          description: "Review and submit all applications",
          expectedOutput: "Applications submitted successfully",
        },
      ],
    }),
  },
  analyze_data: {
    type: "analyze_data",
    name: "Analyze Data",
    description: "Statistical analysis, trends, insights from CSV/Excel data",
    icon: "📊",
    creditCost: 10,
    handler: (input: string) => ({
      taskName: "Data Analysis",
      goal: `Analyze data: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Data Overview",
          description: "Load data, check structure, identify columns, data types, missing values",
          expectedOutput: "Data summary with row count, column types, missing value report"
        },
        {
          id: "slave_2",
          name: "Descriptive Statistics",
          description: "Calculate mean, median, mode, std dev, quartiles for numerical columns",
          expectedOutput: "Statistical summary table with key metrics"
        },
        {
          id: "slave_3",
          name: "Trend Analysis",
          description: "Identify correlations, outliers, patterns, time-based trends if applicable",
          expectedOutput: "List of key findings: correlations, anomalies, trends"
        },
        {
          id: "slave_4",
          name: "Visualize Insights",
          description: "Create charts: histograms, scatter plots, correlation matrix, time series",
          expectedOutput: "Data visualization recommendations with chart types"
        },
        {
          id: "slave_5",
          name: "Generate Report",
          description: "Synthesize findings into executive summary with actionable insights",
          expectedOutput: "Final analysis report with recommendations"
        }
      ]
    })
  },

  write_content: {
    type: "write_content",
    name: "Write Content",
    description: "Blog posts, articles, social media, marketing copy",
    icon: "✍️",
    creditCost: 8,
    handler: (input: string) => ({
      taskName: "Content Creation",
      goal: `Write content: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Research Topic",
          description: "Find trending keywords, competitor content, audience interests, current discussions",
          expectedOutput: "Topic research with keywords, trends, gaps"
        },
        {
          id: "slave_2",
          name: "Create Outline",
          description: "Structure content with intro, main points, conclusion, optimal flow",
          expectedOutput: "Detailed outline with sections and key points"
        },
        {
          id: "slave_3",
          name: "Write Draft",
          description: "Write engaging content with hooks, examples, data, compelling narrative",
          expectedOutput: "Complete first draft of content"
        },
        {
          id: "slave_4",
          name: "Optimize SEO",
          description: "Add keywords naturally, meta description, headings, internal links",
          expectedOutput: "SEO-optimized version with metadata"
        },
        {
          id: "slave_5",
          name: "Polish & Edit",
          description: "Check grammar, clarity, tone, readability, remove fluff",
          expectedOutput: "Final polished content ready to publish"
        }
      ]
    })
  },

  generate_code: {
    type: "generate_code",
    name: "Generate Code",
    description: "Functions, APIs, scripts, utilities in any language",
    icon: "💻",
    creditCost: 12,
    handler: (input: string) => ({
      taskName: "Code Generation",
      goal: `Generate code: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Analyze Requirements",
          description: "Break down requirements, identify inputs/outputs, edge cases, constraints",
          expectedOutput: "Technical specification with requirements breakdown"
        },
        {
          id: "slave_2",
          name: "Design Architecture",
          description: "Choose optimal approach, data structures, algorithms, design patterns",
          expectedOutput: "Architecture design with justification"
        },
        {
          id: "slave_3",
          name: "Write Implementation",
          description: "Write clean, documented code with error handling, type safety",
          expectedOutput: "Complete working code implementation"
        },
        {
          id: "slave_4",
          name: "Add Tests",
          description: "Write unit tests, edge case tests, integration tests",
          expectedOutput: "Test suite with coverage"
        },
        {
          id: "slave_5",
          name: "Documentation",
          description: "Write usage examples, API docs, setup instructions, common issues",
          expectedOutput: "Complete documentation"
        }
      ]
    })
  },

  build_apps: {
    type: "build_apps",
    name: "Build Apps",
    description: "Full applications, MVPs, prototypes from idea to deployment",
    icon: "🚀",
    creditCost: 20,
    handler: (input: string) => ({
      taskName: "App Development",
      goal: `Build app: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Feature Planning",
          description: "Define MVP features, user stories, priorities, scope",
          expectedOutput: "Feature list with priorities and user stories"
        },
        {
          id: "slave_2",
          name: "Tech Stack Selection",
          description: "Choose framework, database, hosting, APIs based on requirements",
          expectedOutput: "Tech stack recommendation with reasoning"
        },
        {
          id: "slave_3",
          name: "UI/UX Design",
          description: "Design screens, user flows, wireframes, component hierarchy",
          expectedOutput: "UI mockups and component structure"
        },
        {
          id: "slave_4",
          name: "Backend Development",
          description: "Build API, database schema, authentication, business logic",
          expectedOutput: "Backend code with API endpoints"
        },
        {
          id: "slave_5",
          name: "Frontend Development",
          description: "Build UI components, state management, API integration",
          expectedOutput: "Frontend code with all features"
        },
        {
          id: "slave_6",
          name: "Testing & Deployment",
          description: "Test functionality, fix bugs, deploy to production, setup CI/CD",
          expectedOutput: "Deployed app with testing report"
        }
      ]
    })
  },

  research_topics: {
    type: "research_topics",
    name: "Research Topics",
    description: "Deep research, synthesis, citations, comprehensive reports",
    icon: "🔬",
    creditCost: 15,
    handler: (input: string) => ({
      taskName: "Topic Research",
      goal: `Research: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Find Sources",
          description: "Search academic papers, articles, expert opinions, recent studies",
          expectedOutput: "List of credible sources with summaries"
        },
        {
          id: "slave_2",
          name: "Extract Key Points",
          description: "Identify main arguments, data, methodologies, conclusions",
          expectedOutput: "Key findings from each source"
        },
        {
          id: "slave_3",
          name: "Cross-Reference",
          description: "Compare findings, identify consensus, note conflicting views",
          expectedOutput: "Synthesis showing agreements and disagreements"
        },
        {
          id: "slave_4",
          name: "Identify Gaps",
          description: "Find unanswered questions, research opportunities, missing data",
          expectedOutput: "Research gaps and future directions"
        },
        {
          id: "slave_5",
          name: "Create Bibliography",
          description: "Format citations (APA, MLA, Chicago), create reference list",
          expectedOutput: "Formatted bibliography with all sources"
        },
        {
          id: "slave_6",
          name: "Write Research Report",
          description: "Synthesize findings into comprehensive report with citations",
          expectedOutput: "Complete research report with references"
        }
      ]
    })
  },

  create_reports: {
    type: "create_reports",
    name: "Create Reports",
    description: "Business reports, analytics dashboards, executive summaries",
    icon: "📑",
    creditCost: 12,
    handler: (input: string) => ({
      taskName: "Report Generation",
      goal: `Create report: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Gather Data",
          description: "Collect metrics, KPIs, supporting data, context",
          expectedOutput: "Complete dataset with all required metrics"
        },
        {
          id: "slave_2",
          name: "Analyze Trends",
          description: "Calculate changes, growth rates, comparisons, benchmarks",
          expectedOutput: "Analysis with trends and comparisons"
        },
        {
          id: "slave_3",
          name: "Create Visualizations",
          description: "Design charts, graphs, tables to illustrate key points",
          expectedOutput: "Visual aids for data presentation"
        },
        {
          id: "slave_4",
          name: "Write Executive Summary",
          description: "Summarize key findings, implications, recommendations in 1-2 pages",
          expectedOutput: "Executive summary for stakeholders"
        },
        {
          id: "slave_5",
          name: "Format Report",
          description: "Structure with intro, findings, analysis, recommendations, appendix",
          expectedOutput: "Professional formatted report (PDF/DOCX)"
        }
      ]
    })
  },

  draft_emails: {
    type: "draft_emails",
    name: "Draft Emails",
    description: "Professional emails, cold outreach, follow-ups, responses",
    icon: "📧",
    creditCost: 5,
    handler: (input: string) => ({
      taskName: "Email Drafting",
      goal: `Draft email: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Define Objective",
          description: "Clarify goal: inform, persuade, request, respond, follow-up",
          expectedOutput: "Email objective and desired outcome"
        },
        {
          id: "slave_2",
          name: "Research Recipient",
          description: "Understand recipient role, interests, communication style, context",
          expectedOutput: "Recipient profile and personalization points"
        },
        {
          id: "slave_3",
          name: "Draft Multiple Versions",
          description: "Write 3 versions: formal, casual, balanced tone",
          expectedOutput: "Three email drafts with different approaches"
        },
        {
          id: "slave_4",
          name: "Optimize Subject Line",
          description: "Create compelling subject lines with high open rates",
          expectedOutput: "5 subject line options ranked by effectiveness"
        },
        {
          id: "slave_5",
          name: "Final Polish",
          description: "Check grammar, clarity, CTA, remove filler, ensure impact",
          expectedOutput: "Final polished email ready to send"
        }
      ]
    })
  },

  plan_strategies: {
    type: "plan_strategies",
    name: "Plan Strategies",
    description: "Business strategy, marketing plans, growth roadmaps",
    icon: "🎯",
    creditCost: 18,
    handler: (input: string) => ({
      taskName: "Strategy Planning",
      goal: `Plan strategy: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Situation Analysis",
          description: "SWOT analysis, market conditions, competitive landscape, resources",
          expectedOutput: "Comprehensive situation assessment"
        },
        {
          id: "slave_2",
          name: "Define Objectives",
          description: "Set SMART goals, KPIs, success metrics, timelines",
          expectedOutput: "Clear objectives with measurable targets"
        },
        {
          id: "slave_3",
          name: "Identify Options",
          description: "Brainstorm approaches, evaluate alternatives, assess risks",
          expectedOutput: "Strategic options with pros/cons"
        },
        {
          id: "slave_4",
          name: "Select Strategy",
          description: "Choose optimal approach, justify decision, outline execution",
          expectedOutput: "Recommended strategy with justification"
        },
        {
          id: "slave_5",
          name: "Create Action Plan",
          description: "Break into phases, assign responsibilities, set milestones",
          expectedOutput: "Detailed action plan with timeline"
        },
        {
          id: "slave_6",
          name: "Risk Mitigation",
          description: "Identify risks, contingency plans, monitoring approach",
          expectedOutput: "Risk assessment with mitigation strategies"
        }
      ]
    })
  },

  debug_code: {
    type: "debug_code",
    name: "Debug Code",
    description: "Find bugs, fix errors, optimize performance, refactor",
    icon: "🐛",
    creditCost: 10,
    handler: (input: string) => ({
      taskName: "Code Debugging",
      goal: `Debug: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Reproduce Issue",
          description: "Understand error, reproduce bug, identify conditions that trigger it",
          expectedOutput: "Steps to reproduce with error details"
        },
        {
          id: "slave_2",
          name: "Analyze Code Flow",
          description: "Trace execution, check variable states, identify where logic breaks",
          expectedOutput: "Code flow analysis showing problem area"
        },
        {
          id: "slave_3",
          name: "Identify Root Cause",
          description: "Find actual bug source, not just symptoms, understand why it happens",
          expectedOutput: "Root cause explanation with evidence"
        },
        {
          id: "slave_4",
          name: "Implement Fix",
          description: "Write corrected code, handle edge cases, maintain compatibility",
          expectedOutput: "Fixed code with explanation of changes"
        },
        {
          id: "slave_5",
          name: "Test Solution",
          description: "Verify fix works, test edge cases, ensure no new bugs introduced",
          expectedOutput: "Test results confirming fix"
        }
      ]
    })
  },

  design_systems: {
    type: "design_systems",
    name: "Design Systems",
    description: "Architecture design, system diagrams, technical specs",
    icon: "🏗️",
    creditCost: 15,
    handler: (input: string) => ({
      taskName: "System Design",
      goal: `Design system: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Requirements Gathering",
          description: "Functional requirements, non-functional (scale, security), constraints",
          expectedOutput: "Complete requirements specification"
        },
        {
          id: "slave_2",
          name: "High-Level Architecture",
          description: "System components, interactions, data flow, integration points",
          expectedOutput: "Architecture diagram with component descriptions"
        },
        {
          id: "slave_3",
          name: "Database Design",
          description: "Schema design, relationships, indexes, optimization strategy",
          expectedOutput: "Database schema with justification"
        },
        {
          id: "slave_4",
          name: "API Design",
          description: "Endpoints, request/response formats, authentication, versioning",
          expectedOutput: "API specification (REST/GraphQL)"
        },
        {
          id: "slave_5",
          name: "Scalability Plan",
          description: "Load balancing, caching, horizontal scaling, bottleneck prevention",
          expectedOutput: "Scalability strategy with benchmarks"
        },
        {
          id: "slave_6",
          name: "Security Design",
          description: "Auth flow, data encryption, input validation, security best practices",
          expectedOutput: "Security architecture and measures"
        }
      ]
    })
  },

  optimize_workflows: {
    type: "optimize_workflows",
    name: "Optimize Workflows",
    description: "Process improvement, automation, efficiency gains",
    icon: "⚙️",
    creditCost: 12,
    handler: (input: string) => ({
      taskName: "Workflow Optimization",
      goal: `Optimize workflow: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Map Current Process",
          description: "Document current workflow steps, time spent, pain points, dependencies",
          expectedOutput: "Current process flowchart with metrics"
        },
        {
          id: "slave_2",
          name: "Identify Bottlenecks",
          description: "Find slowest steps, redundant tasks, manual work, waiting time",
          expectedOutput: "Bottleneck analysis with impact assessment"
        },
        {
          id: "slave_3",
          name: "Research Solutions",
          description: "Find tools, automation options, best practices, case studies",
          expectedOutput: "Solution options with cost/benefit"
        },
        {
          id: "slave_4",
          name: "Design Optimized Process",
          description: "Streamline steps, automate tasks, parallel processing, eliminate waste",
          expectedOutput: "Optimized workflow diagram"
        },
        {
          id: "slave_5",
          name: "Calculate ROI",
          description: "Estimate time saved, cost reduction, productivity gain vs investment",
          expectedOutput: "ROI analysis with projections"
        },
        {
          id: "slave_6",
          name: "Implementation Plan",
          description: "Rollout phases, training needs, change management, success metrics",
          expectedOutput: "Step-by-step implementation guide"
        }
      ]
    })
  },

  audit_costs: {
    type: "audit_costs",
    name: "Audit Costs",
    description: "Cost analysis, budget review, savings opportunities",
    icon: "💰",
    creditCost: 10,
    handler: (input: string) => ({
      taskName: "Cost Audit",
      goal: `Audit costs: ${input}`,
      slaveNodes: [
        {
          id: "slave_1",
          name: "Gather Expenses",
          description: "Collect all cost data: subscriptions, services, infrastructure, labor",
          expectedOutput: "Complete expense breakdown by category"
        },
        {
          id: "slave_2",
          name: "Categorize Spending",
          description: "Group by type, department, necessity (must-have vs nice-to-have)",
          expectedOutput: "Categorized spending report"
        },
        {
          id: "slave_3",
          name: "Benchmark Costs",
          description: "Compare to industry standards, similar companies, historical data",
          expectedOutput: "Benchmark comparison showing outliers"
        },
        {
          id: "slave_4",
          name: "Identify Waste",
          description: "Find unused subscriptions, over-provisioned resources, duplicate tools",
          expectedOutput: "List of wasteful expenses with amounts"
        },
        {
          id: "slave_5",
          name: "Find Alternatives",
          description: "Research cheaper options, bundle deals, open-source alternatives",
          expectedOutput: "Alternative solutions with savings"
        },
        {
          id: "slave_6",
          name: "Savings Roadmap",
          description: "Prioritize quick wins, long-term savings, implementation plan",
          expectedOutput: "Cost optimization plan with timeline"
        }
      ]
    })
  },

  shop_search: {
    type: "shop_search",
    name: "Shopping Search",
    description: "Find best deals, compare prices, and locate products",
    icon: "🛍️",
    creditCost: 8,
    handler: (input: string) => ({
      taskName: "Shopping Search",
      goal: `Find: ${input}`,
      slaveNodes: [
        { id: "slave_1", name: "Understand Request", description: "Extract product, budget, preferences, and store preferences from the query", expectedOutput: "Product spec, budget range, preferred stores" },
        { id: "slave_2", name: "Search Products", description: "Find matching products at the requested retailer(s)", expectedOutput: "List of matching products with prices" },
        { id: "slave_3", name: "Compare Options", description: "Compare results by price, quality, reviews, and value", expectedOutput: "Ranked comparison table" },
        { id: "slave_4", name: "Find Deals & Coupons", description: "Check for active promo codes, loyalty discounts, and sale prices", expectedOutput: "Applied discounts and final prices" },
        { id: "slave_5", name: "Recommend Best Pick", description: "Recommend the best option with justification", expectedOutput: "Top pick with reasoning and direct link" },
      ],
    }),
  },

  web_search: {
    type: "web_search",
    name: "Web Search",
    description: "Search, find, and compile information from the web",
    icon: "🔍",
    creditCost: 6,
    handler: (input: string) => ({
      taskName: "Web Search",
      goal: `Find: ${input}`,
      slaveNodes: [
        { id: "slave_1", name: "Define Search", description: "Break down the query into optimal search terms", expectedOutput: "Search queries and target sources" },
        { id: "slave_2", name: "Search & Retrieve", description: "Execute searches and retrieve top results", expectedOutput: "Top 10 relevant results" },
        { id: "slave_3", name: "Filter & Verify", description: "Filter for relevance, recency, and credibility", expectedOutput: "Shortlist of credible results" },
        { id: "slave_4", name: "Synthesise Findings", description: "Summarise key information across sources", expectedOutput: "Concise summary with sources" },
      ],
    }),
  },
  media_search: {
    type: "media_search",
    name: "Media Search",
    description: "Find music, videos, podcasts and playlists with direct links",
    icon: "🎵",
    creditCost: 4,
    handler: (input: string) => ({
      taskName: "Media Search",
      goal: `Find: ${input}`,
      slaveNodes: [
        { id: "slave_1", name: "Understand Request", description: "Identify what media is wanted, which platform, mood/genre", expectedOutput: "Media type, platform, query terms" },
        { id: "slave_2", name: "Find Direct Links", description: "Generate search URLs and known playlist/channel links", expectedOutput: "Clickable links to relevant content" },
        { id: "slave_3", name: "Curate Top Picks", description: "Recommend best matching content with descriptions", expectedOutput: "Top 5 picks with links and descriptions" },
      ],
    }),
  },
};
export function getTaskHandler(type: TaskType): TaskHandler {
  return TASK_HANDLERS[type];
}

/**
 * Detect task type from user input
 */
export function detectTaskType(input: string): TaskType | null {
  const inputLower = input.toLowerCase();

  if (/(apply|application|submit|resume).*(job|position|role|linkedin|indeed)/i.test(inputLower)) {
    return "job_application";
  }
  if (/(analyz|analy[sz]e|statistic|data|csv|excel|trend)/i.test(inputLower)) {
    return "analyze_data";
  }
  if (/(write|blog|article|content|post|copy)/i.test(inputLower)) {
    return "write_content";
  }
  if (/(generate|create|write).*(code|function|script|program)/i.test(inputLower)) {
    return "generate_code";
  }
  if (/(build|develop|create).*(app|application|software|mvp|prototype)/i.test(inputLower)) {
    return "build_apps";
  }
  if (/(research|study|investigate|explore|learn about)/i.test(inputLower)) {
    return "research_topics";
  }
  if (/(report|summary|dashboard|presentation)/i.test(inputLower)) {
    return "create_reports";
  }
  if (/(email|message|letter|outreach)/i.test(inputLower)) {
    return "draft_emails";
  }
  if (/(strategy|plan|roadmap|approach)/i.test(inputLower)) {
    return "plan_strategies";
  }
  if (/(debug|fix|bug|error|issue)/i.test(inputLower)) {
    return "debug_code";
  }
  if (/(design|architect|system|infrastructure)/i.test(inputLower)) {
    return "design_systems";
  }
  if (/(optimize|improve|automate|workflow|process)/i.test(inputLower)) {
    return "optimize_workflows";
  }
  if (/(audit|cost|expense|budget|spending)/i.test(inputLower)) {
    return "audit_costs";
  }

  // Media — play, watch, listen, stream requests
  if (/^(play|watch|listen\s*(to)?|stream|put\s+on|queue)\s+/i.test(inputLower) ||
      /(play|stream|listen\s*to).*(on\s+)?(youtube|spotify|netflix|apple\s*music|soundcloud|tidal|deezer|twitch|hulu|disney)/i.test(inputLower) ||
      /(find|search|get).*(song|music|playlist|album|podcast|episode|video|movie|show|series|lofi|beats|mix)/i.test(inputLower)) {
    return "media_search";
  }

  // Shopping — explicit product/deal searches at named or implied retailers
  if (/(find|get|search|show|look\s*up|buy|order|purchase|shop|deal|price|cheap|discount|sale|coupon|offer).*(shirt|shoe|cloth|dress|jacket|pant|top|product|item)/i.test(inputLower) ||
      /(best\s+deal|cheapest|lowest\s+price|on\s+sale).*(at|on|from)?\s*(target|amazon|walmart|ebay|etsy|zara|h&m|nike|adidas|nordstrom)/i.test(inputLower) ||
      /(find|search|get|show|look\s*up)\s+(me\s+)?(a\s+|the\s+|some\s+)?.*\s+(at|on|from)\s+(target|amazon|walmart|ebay|etsy|bestbuy|costco|shein)/i.test(inputLower)) {
    return "shop_search";
  }

  // Web search — explicit find/search/look up requests that aren't shopping or media
  if (/^(find|search\s+for|look\s+up|get\s+me|show\s+me|tell\s+me|what\s+is|where\s+(is|can)|who\s+is|how\s+(do|can|to))\s+/i.test(inputLower) ||
      /(find\s+(me\s+)?(the\s+)?(best|cheapest|top|latest|current|nearest)|search\s+(for|the)|look\s+up)/i.test(inputLower)) {
    return "web_search";
  }

  // Broad agentic catch-all — imperative requests that imply multi-step work
  if (/^(help\s+me|i\s+need\s+(to|you\s+to)|can\s+you|could\s+you|please)\s+(find|get|create|build|make|set\s+up|figure\s+out|put\s+together|come\s+up\s+with|generate|produce|organize|prepare)/i.test(inputLower)) {
    return "research_topics";
  }

  return null;
}