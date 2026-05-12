// lib/workflows.ts
// ─────────────────────────────────────────────────────────────────────────────
// Workflow template definitions.
// Each template defines a sequence of breadcrumb steps.
// Users pick a template → an instance is created → they work through steps.
// Each step has: title, description, systemPrompt, suggestedTools, inputHint.
// ─────────────────────────────────────────────────────────────────────────────

import { type WorkflowStep, generateId } from "./store";

// ── Step template (before instantiation) ─────────────────────────────────────

export interface StepTemplate {
  title:          string;
  description:    string;
  systemPrompt:   string;        // injected as system context for this step
  inputHint:      string;        // placeholder for user input box
  suggestedTools: ToolName[];    // which agent tools are pre-enabled
  outputFormat:   "markdown" | "code" | "report" | "structured" | "chat";
  canAttachFiles: boolean;
  canUseMarket:   boolean;
}

export type ToolName =
  | "web_search"
  | "code_exec"
  | "file_read"
  | "market_data"
  | "image_gen"
  | "video_gen"
  | "code_gen"
  | "export"
  | "chart_gen";

// ── Workflow template ─────────────────────────────────────────────────────────

export interface WorkflowTemplate {
  id:          string;
  label:       string;
  icon:        string;
  description: string;
  category:    "design" | "finance" | "research" | "engineering" | "content" | "hr" | "data" | "custom";
  steps:       StepTemplate[];
  color:       string;   // accent color override (CSS variable or hex)
}

// ── Instantiate template → WorkflowStep[] ────────────────────────────────────

export function instantiateTemplate(template: WorkflowTemplate): WorkflowStep[] {
  return template.steps.map((s, i) => ({
    id:               generateId("step_"),
    title:            s.title,
    description:      s.description,
    status:           i === 0 ? "active" : "pending",
    userInput:        "",
    agentOutput:      "",
    suggestedContext: "",
    selectedContext:  "",
    attachments:      [],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [

  // ── Web / App Development ───────────────────────────────────────────────
  {
    id:          "web_development",
    label:       "Build a Website / App",
    icon:        "⬡",
    description: "From idea to deployable code — language choice, UX, UI, architecture, and implementation.",
    category:    "engineering",
    color:       "#5E8FC8",
    steps: [
      {
        title:          "Define the Project",
        description:    "What are you building? Who is it for? What problem does it solve?",
        systemPrompt:   `You are a senior software architect helping define a project. 
Ask clarifying questions, identify key requirements, constraints, and success metrics.
At the end, produce a concise project brief with: goal, target users, core features (max 5), tech constraints.
Highlight exactly what should be carried into the next step.`,
        inputHint:      "Describe your idea, e.g. 'A SaaS dashboard for freelancers to track invoices'",
        suggestedTools: ["web_search"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Choose Tech Stack",
        description:    "Pick your language, framework, database, and hosting based on the project brief.",
        systemPrompt:   `You are a principal engineer advising on technology choices.
Review the project brief from the previous step.
Compare 2–3 stack options with trade-offs (complexity, cost, scalability, speed to ship).
Make a clear recommendation with justification.
Highlight the final stack decision to carry forward.`,
        inputHint:      "Any preferences? e.g. 'I know React', 'must be serverless', 'budget < $20/mo'",
        suggestedTools: ["web_search", "code_gen"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Brainstorm UX Flows",
        description:    "Map the critical user journeys — what does each type of user do from entry to goal?",
        systemPrompt:   `You are a senior UX designer.
Using the project brief and tech stack, map out 3–5 critical user flows.
For each flow: entry point → key actions → exit/goal.
Identify where users are most likely to drop off or get confused.
Highlight the flows that matter most for the next step.`,
        inputHint:      "Any existing flows to preserve? Pain points you've seen?",
        suggestedTools: ["web_search", "code_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Design the UI",
        description:    "Define visual language, component hierarchy, layout patterns, and key screens.",
        systemPrompt:   `You are a senior UI designer and front-end architect.
Based on the UX flows, define: color palette, typography, component library choice, layout system.
Describe each key screen in enough detail to implement (sections, hierarchy, states, interactions).
Generate any relevant HTML/CSS/JSX code snippets to illustrate components.
Highlight design decisions + component specs to carry into implementation.`,
        inputHint:      "Brand direction? Dark/light? Reference designs you like?",
        suggestedTools: ["code_gen", "image_gen"],
        outputFormat:   "code",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Architecture & Data Model",
        description:    "Define your API routes, database schema, state management, and folder structure.",
        systemPrompt:   `You are a backend architect.
Based on the project brief, tech stack, and UI design, produce:
1. Folder/file structure
2. Database schema (tables or collections)
3. API routes (method, path, request, response)
4. State management approach
5. Auth strategy (if needed)
Generate concrete code for the schema and key API stubs.`,
        inputHint:      "Any existing DB or API constraints?",
        suggestedTools: ["code_gen", "code_exec"],
        outputFormat:   "code",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Implementation",
        description:    "Generate the working code for your key features, components, and logic.",
        systemPrompt:   `You are a senior full-stack engineer.
Using the architecture, schema, and design specs from previous steps, write complete, working code.
Cover: key components, API handlers, data access layer, utility functions.
Code must be production-quality: typed, commented, error-handled.
Provide copy-ready files with clear filenames.`,
        inputHint:      "Which feature should we implement first?",
        suggestedTools: ["code_gen", "code_exec", "web_search"],
        outputFormat:   "code",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Review & Export",
        description:    "Final review, deployment checklist, and export of all generated artifacts.",
        systemPrompt:   `You are a senior tech lead doing a pre-launch review.
Review everything built in this workflow.
Produce: security checklist, performance checklist, deployment steps, environment variables needed.
List any gaps or TODOs. Then summarize the complete project for handoff.`,
        inputHint:      "Any specific concerns before launching?",
        suggestedTools: ["web_search", "export"],
        outputFormat:   "report",
        canAttachFiles: true,
        canUseMarket:   false,
      },
    ],
  },

  // ── UX Research ─────────────────────────────────────────────────────────
  {
    id:          "ux_research",
    label:       "UX Research & Design",
    icon:        "◉",
    description: "Research planning, synthesis, design decisions, and usability testing.",
    category:    "design",
    color:       "#DA7756",
    steps: [
      {
        title:          "Research Brief",
        description:    "Define what you're studying, who your users are, and what questions matter.",
        systemPrompt:   `You are a UX research lead. Help define a clear research brief.
Cover: product/feature being studied, target user segments, key research questions (max 5), success metrics.
Suggest the right research methods (interviews, surveys, usability tests, diary studies).`,
        inputHint:      "What product or feature are you researching? What decisions are you trying to make?",
        suggestedTools: ["web_search"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "User Interview Guide",
        description:    "Create a structured interview guide with questions, probes, and tasks.",
        systemPrompt:   `You are an experienced UX researcher. 
Create a full interview guide including: warm-up questions, core questions (open-ended), task scenarios, closing questions.
Include probing follow-ups. Avoid leading questions. 
Format as a ready-to-use script.`,
        inputHint:      "Any specific behaviors or pain points to probe?",
        suggestedTools: ["export"],
        outputFormat:   "report",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Synthesize Findings",
        description:    "Analyze your research data, identify patterns, and extract insights.",
        systemPrompt:   `You are a senior UX researcher synthesizing research findings.
If data is provided, analyze it for: behavioral patterns, pain points with frequency, unmet needs, positive moments.
Use affinity mapping logic: cluster related observations, name themes, prioritize by impact.
Output: top 5 findings with supporting evidence, severity scores (1–10), and recommended design directions.`,
        inputHint:      "Paste notes, transcripts, or survey responses here",
        suggestedTools: ["file_read", "export"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Design Recommendations",
        description:    "Translate insights into prioritized design changes and opportunity areas.",
        systemPrompt:   `You are a product designer translating research into design decisions.
Based on the findings, produce: 
- 'How might we' statements for each finding
- Specific design recommendations (not vague — name the UI element and change)
- Priority matrix (impact vs effort)
- Success metrics to validate each recommendation`,
        inputHint:      "Any constraints? (timeline, dev capacity, platform)",
        suggestedTools: ["code_gen", "image_gen"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Usability Test Plan",
        description:    "Design a test to validate your design decisions before shipping.",
        systemPrompt:   `You are a UX researcher designing a usability test.
Create: participant screener, test objectives, task scenarios (5–7 tasks), success criteria for each task, observation guide.
Suggest tools/platforms for remote testing. Include a post-test survey (SUS or custom).`,
        inputHint:      "Moderated or unmoderated? Remote or in-person? How many participants?",
        suggestedTools: ["export"],
        outputFormat:   "report",
        canAttachFiles: false,
        canUseMarket:   false,
      },
    ],
  },

  // ── Trading & Finance ────────────────────────────────────────────────────
  {
    id:          "trading_analysis",
    label:       "Trading & Finance Analysis",
    icon:        "◎",
    description: "Market research, strategy backtesting, portfolio analysis, and trade planning.",
    category:    "finance",
    color:       "#6BAA7A",
    steps: [
      {
        title:          "Market Overview",
        description:    "Pull live market data, scan for setups, and identify macro context.",
        systemPrompt:   `You are a quantitative market analyst.
Analyze current market conditions using any data provided.
Cover: trend (daily/weekly), key levels (support/resistance), volatility (ATR/VIX), volume patterns, sector rotation.
Flag any high-probability setups visible in the data.
IMPORTANT: This is educational analysis only. Not financial advice.`,
        inputHint:      "Which ticker(s) or asset class? Any specific timeframe?",
        suggestedTools: ["market_data", "web_search", "chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   true,
      },
      {
        title:          "Strategy Definition",
        description:    "Define entry criteria, exit rules, position sizing, and risk parameters.",
        systemPrompt:   `You are a systematic trader helping define a clear strategy.
Based on the market overview, define: entry criteria (specific, objective), exit rules (stop loss, take profit, time stop), position sizing formula, max risk per trade, max portfolio risk.
Generate Python code for backtesting this strategy on historical data.
NOT financial advice — hypothetical strategy construction only.`,
        inputHint:      "What's your edge thesis? Any existing rules to refine?",
        suggestedTools: ["code_gen", "code_exec"],
        outputFormat:   "code",
        canAttachFiles: false,
        canUseMarket:   true,
      },
      {
        title:          "Data Import & Analysis",
        description:    "Import your trade history or price data and run statistical analysis.",
        systemPrompt:   `You are a quantitative analyst.
Analyze the imported trading data for: win rate, average win/loss, profit factor, max drawdown, Sharpe ratio, best/worst setups, time-of-day patterns, holding period analysis.
Generate Python/pandas code for each calculation.
All findings are patterns in historical data only.`,
        inputHint:      "Upload your brokerage export or paste trade data",
        suggestedTools: ["file_read", "code_exec", "chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   true,
      },
      {
        title:          "Risk & Portfolio Review",
        description:    "Analyze portfolio composition, correlation, and risk-adjusted returns.",
        systemPrompt:   `You are a portfolio risk manager.
Analyze portfolio for: concentration risk, correlation between positions, beta exposure, volatility contribution per position, VaR estimate.
Generate a risk dashboard with key metrics. Suggest position adjustments to improve risk-adjusted returns.`,
        inputHint:      "Paste or upload your current positions / portfolio",
        suggestedTools: ["file_read", "code_exec", "chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   true,
      },
      {
        title:          "Trade Report",
        description:    "Generate a complete trade journal report for review or tax purposes.",
        systemPrompt:   `You are preparing a comprehensive trade performance report.
Summarize: performance by month, by strategy, by asset class. Identify behavioral patterns (overtrading, FOMO, revenge trading).
Generate a formatted PDF-ready report. Include CSV export of all metrics.
Tax note: consult a qualified tax professional for actual tax filing.`,
        inputHint:      "Date range? Include specific metrics?",
        suggestedTools: ["export", "chart_gen"],
        outputFormat:   "report",
        canAttachFiles: true,
        canUseMarket:   false,
      },
    ],
  },

  // ── HR & People ──────────────────────────────────────────────────────────
  {
    id:          "hr_analytics",
    label:       "HR & People Analytics",
    icon:        "◐",
    description: "Employee surveys, attrition analysis, performance data, and people strategy.",
    category:    "hr",
    color:       "#D4924A",
    steps: [
      {
        title:          "Data Import & Audit",
        description:    "Import your HR data and audit for completeness, quality, and PII exposure.",
        systemPrompt:   `You are an HR analytics expert. All PII must be identified and flagged.
Review the data for: completeness (missing values %), data types, date ranges, potential PII (names, emails, SSNs, DOBs).
Produce a data quality report. Flag any PII that should be masked before analysis.`,
        inputHint:      "Upload your HR export (survey results, HRIS export, etc.)",
        suggestedTools: ["file_read"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Engagement Analysis",
        description:    "Analyze survey scores, identify key drivers of engagement and disengagement.",
        systemPrompt:   `You are an organizational psychologist analyzing employee engagement data.
Identify: overall engagement score trend, top 3 drivers of high engagement, top 3 factors causing disengagement, department/team-level patterns, demographic patterns (aggregate only, never individual).
Severity-score each issue (1–10). Recommend specific interventions.`,
        inputHint:      "Any specific teams or timeframes to focus on?",
        suggestedTools: ["chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Attrition & Retention",
        description:    "Model attrition risk, identify flight risks, and build retention strategies.",
        systemPrompt:   `You are an HR data scientist analyzing attrition patterns.
Analyze: voluntary vs involuntary attrition rate, time-to-leave patterns, attrition by department/role/tenure, correlation with engagement scores.
Build a risk framework to identify at-risk segments (aggregate, never individual).
Generate retention intervention recommendations with expected impact.`,
        inputHint:      "What's your biggest retention challenge right now?",
        suggestedTools: ["code_exec", "chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Performance Insights",
        description:    "Analyze performance data to identify patterns, bias, and calibration issues.",
        systemPrompt:   `You are an HR analytics expert reviewing performance data.
Check for: rating distribution (inflation/deflation), manager consistency, demographic bias in ratings (aggregate), correlation between performance and attrition.
Flag any calibration issues. Recommend process improvements.`,
        inputHint:      "Performance review cycle details?",
        suggestedTools: ["chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "People Strategy Report",
        description:    "Generate an executive people strategy report with recommendations.",
        systemPrompt:   `You are a Chief People Officer preparing a board-level people strategy report.
Synthesize all findings from previous steps into: executive summary, key metrics dashboard, strategic priorities (top 3), 90-day action plan, success metrics.
Format for executive presentation. Export-ready.`,
        inputHint:      "Any strategic priorities or board questions to address?",
        suggestedTools: ["export"],
        outputFormat:   "report",
        canAttachFiles: false,
        canUseMarket:   false,
      },
    ],
  },

  // ── Content Creation ─────────────────────────────────────────────────────
  {
    id:          "content_strategy",
    label:       "Content Strategy & Creation",
    icon:        "▶",
    description: "Research, ideation, scripting, thumbnails, and performance optimization.",
    category:    "content",
    color:       "#DA7756",
    steps: [
      {
        title:          "Audience & Niche Research",
        description:    "Identify your audience, competitors, and content opportunities.",
        systemPrompt:   `You are a content strategist. Research the target niche and audience.
Identify: audience demographics and pain points, top 5 competitor channels/accounts, content gaps in the niche, best-performing content formats, optimal publishing cadence.
Use web search to find real data.`,
        inputHint:      "What platform? What niche/topic? Any existing channel info?",
        suggestedTools: ["web_search"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Content Ideation",
        description:    "Generate a content calendar with titles, hooks, and formats.",
        systemPrompt:   `You are a creative director and content strategist.
Generate 20 content ideas based on the research. For each: title (optimized for clicks), hook (first 3 seconds), format (short/long/live), estimated difficulty, estimated reach potential.
Organize into a 30-day content calendar.`,
        inputHint:      "Any topics to avoid? Tone preferences?",
        suggestedTools: ["web_search"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Script & Copy Writing",
        description:    "Write full scripts, descriptions, captions, and calls-to-action.",
        systemPrompt:   `You are a professional scriptwriter and copywriter.
Write a complete script for the selected content piece: hook (0–3s), intro (3–30s), main content with b-roll cues, CTA.
Also write: video description (SEO optimized), 5 hashtag sets, 3 thumbnail text options, tweet/IG caption variations.`,
        inputHint:      "Which piece from the calendar? Any talking points to include?",
        suggestedTools: ["web_search", "export"],
        outputFormat:   "report",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Visual Assets",
        description:    "Generate thumbnails, title cards, and promotional graphics.",
        systemPrompt:   `You are an art director creating visual content.
Based on the script and content strategy, design: thumbnail concept with text overlay, color palette, key visual elements.
Generate the actual thumbnail image using AI. Create variation options.`,
        inputHint:      "Brand colors? Style references? Channel aesthetic?",
        suggestedTools: ["image_gen"],
        outputFormat:   "markdown",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Performance Analysis",
        description:    "Analyze your content analytics and optimize your strategy.",
        systemPrompt:   `You are a data-driven content strategist.
Analyze the provided analytics data for: CTR by thumbnail/title, watch time patterns, drop-off points, best performing content types, audience retention benchmarks.
Identify the top 3 things to change and generate A/B test recommendations.`,
        inputHint:      "Upload your YouTube Studio / analytics export",
        suggestedTools: ["file_read", "chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
    ],
  },

  // ── Cloud Cost Analysis ───────────────────────────────────────────────────
  {
    id:          "cloud_cost",
    label:       "Cloud Cost Optimization",
    icon:        "▣",
    description: "AWS/GCP/Azure billing analysis, right-sizing, and savings planning.",
    category:    "data",
    color:       "#5E8FC8",
    steps: [
      {
        title:          "Import Billing Data",
        description:    "Upload your cloud billing export and get an instant cost breakdown.",
        systemPrompt:   `You are a FinOps engineer. Analyze the uploaded billing data.
Produce: total spend by service (top 10), month-over-month trend, cost per environment (prod/staging/dev if available), unexpected spikes (>20% MoM).`,
        inputHint:      "Upload your AWS Cost Explorer / GCP Billing / Azure Cost export",
        suggestedTools: ["file_read", "chart_gen"],
        outputFormat:   "structured",
        canAttachFiles: true,
        canUseMarket:   false,
      },
      {
        title:          "Waste Identification",
        description:    "Find idle resources, oversized instances, and unused storage.",
        systemPrompt:   `You are a cloud cost optimization expert.
Identify: idle/stopped resources still incurring costs, oversized instances (suggest right-sizing), old snapshots and unused storage, data transfer inefficiencies, licensing waste.
Estimate monthly savings for each finding.`,
        inputHint:      "Any known waste areas to check first?",
        suggestedTools: ["web_search", "code_gen"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Optimization Plan",
        description:    "Build a prioritized action plan with savings estimates.",
        systemPrompt:   `You are a FinOps consultant building a cost optimization roadmap.
Produce: quick wins (< 1 day effort, immediate savings), medium wins (1 week), strategic changes (1 month+).
For each: action, owner, effort estimate, monthly savings, risk level.
Generate Terraform/CloudFormation snippets for automated fixes where applicable.`,
        inputHint:      "Team size? Any migration constraints?",
        suggestedTools: ["code_gen"],
        outputFormat:   "structured",
        canAttachFiles: false,
        canUseMarket:   false,
      },
      {
        title:          "Cost Report & Export",
        description:    "Generate a finance-ready cost report for stakeholders.",
        systemPrompt:   `You are preparing a FinOps executive report.
Summarize: current state (spend, waste %, trend), optimization opportunities (total potential savings), implementation roadmap, projected post-optimization spend.
Format for finance/board presentation. Export as CSV and formatted report.`,
        inputHint:      "Stakeholder level? Any specific format requirements?",
        suggestedTools: ["export"],
        outputFormat:   "report",
        canAttachFiles: false,
        canUseMarket:   false,
      },
    ],
  },

  // ── Open / Custom ────────────────────────────────────────────────────────
  {
    id:          "custom",
    label:       "Custom Workflow",
    icon:        "◈",
    description: "Build your own step-by-step workflow from scratch.",
    category:    "custom",
    color:       "#DA7756",
    steps: [
      {
        title:          "Step 1",
        description:    "Your first step — describe what you want to accomplish.",
        systemPrompt:   `You are a helpful AI assistant. Help the user accomplish their goal.
Ask clarifying questions if needed. Provide structured, actionable output.
At the end of your response, highlight what context from this step should flow into the next step.`,
        inputHint:      "What do you want to do?",
        suggestedTools: ["web_search", "code_gen", "file_read"],
        outputFormat:   "chat",
        canAttachFiles: true,
        canUseMarket:   false,
      },
    ],
  },
];

// ── Template lookup ───────────────────────────────────────────────────────────

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(cat: WorkflowTemplate["category"]): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === cat);
}

// ── Category metadata ─────────────────────────────────────────────────────────

export const CATEGORIES: Array<{
  id:    WorkflowTemplate["category"];
  label: string;
  icon:  string;
}> = [
  { id: "engineering", label: "Engineering",   icon: "⬡" },
  { id: "design",      label: "Design & UX",   icon: "◉" },
  { id: "finance",     label: "Finance",        icon: "◎" },
  { id: "content",     label: "Content",        icon: "▶" },
  { id: "hr",          label: "People & HR",    icon: "◐" },
  { id: "data",        label: "Data & Cloud",   icon: "▣" },
  { id: "research",    label: "Research",       icon: "⬢" },
  { id: "custom",      label: "Custom",         icon: "◈" },
];
