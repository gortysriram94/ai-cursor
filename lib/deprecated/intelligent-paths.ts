// lib/intelligent-paths.ts
// Breadcrumb-based intelligent path generation for all 12 task types

export interface PathBreadcrumb {
  context?: string;
  currentState?: string;
  goalState?: string;
  constraints?: string[];
  preferences?: string[];
}

export interface PathStep {
  id: string;
  order: number;
  title: string;
  description: string;
  action: string;
  expectedOutcome: string;
  aiAssistance: string;
  userInput?: string;
}

export interface IntelligentPath {
  taskType: string;
  detectedIntent: string;
  startingPoint: string;
  endingPoint: string;
  steps: PathStep[];
  estimatedTime: string;
  difficulty: "easy" | "medium" | "hard";
  nextQuestion?: string;
}

/**
 * Extract breadcrumbs from user input
 */
export function extractBreadcrumbs(input: string): PathBreadcrumb {
  const breadcrumb: PathBreadcrumb = {
    constraints: [],
    preferences: [],
  };

  // Extract context
  const contextPatterns = [
    /for (my|our|the) (.*?)(project|business|company|startup|team)/i,
    /working on (.*)/i,
    /(.*?) (needs|requires|wants)/i,
  ];

  for (const pattern of contextPatterns) {
    const match = input.match(pattern);
    if (match) {
      breadcrumb.context = match[0];
      break;
    }
  }

  // Extract current state
  const currentStatePatterns = [
    /currently (have|using|at|in) (.*)/i,
    /right now (.*)/i,
    /existing (.*)/i,
  ];

  for (const pattern of currentStatePatterns) {
    const match = input.match(pattern);
    if (match) {
      breadcrumb.currentState = match[2] || match[1];
      break;
    }
  }

  // Extract goal state
  const goalPatterns = [
    /want to (.*)/i,
    /need to (.*)/i,
    /looking to (.*)/i,
    /goal is to (.*)/i,
  ];

  for (const pattern of goalPatterns) {
    const match = input.match(pattern);
    if (match) {
      breadcrumb.goalState = match[1];
      break;
    }
  }

  // Extract constraints
  if (input.match(/budget|cost|price|cheap|affordable/i)) {
    breadcrumb.constraints!.push("budget_conscious");
  }
  if (input.match(/quick|fast|urgent|asap|deadline/i)) {
    breadcrumb.constraints!.push("time_sensitive");
  }
  if (input.match(/simple|easy|basic|beginner/i)) {
    breadcrumb.constraints!.push("complexity_low");
  }

  return breadcrumb;
}

/**
 * ANALYZE DATA - Intelligent Path
 */
export function createDataAnalysisPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "analyze_data",
    detectedIntent: breadcrumb.goalState || "Understand patterns and insights from data",
    startingPoint: breadcrumb.currentState || "Raw dataset uploaded",
    endingPoint: "Actionable insights with visualizations and recommendations",
    estimatedTime: breadcrumb.constraints?.includes("time_sensitive") ? "15 minutes" : "1 hour",
    difficulty: breadcrumb.constraints?.includes("complexity_low") ? "easy" : "medium",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Data Understanding",
        description: "Let me examine your data structure, columns, and data types",
        action: "Load and profile dataset",
        expectedOutcome: "Summary: 10,000 rows × 15 columns, 3 missing value columns identified",
        aiAssistance: "I'll automatically detect issues: missing values, outliers, data types",
        userInput: "✓ Looks good | ⚠️ Focus on revenue column | 🔄 Check date formats",
      },
      {
        id: "step_2",
        order: 2,
        title: "Clean & Prepare",
        description: "Based on the issues found, I'll clean your data",
        action: "Handle missing values, fix data types, remove duplicates",
        expectedOutcome: "Clean dataset: 9,847 rows ready for analysis",
        aiAssistance: "I'll suggest best methods: imputation, deletion, or transformation",
        userInput: "✓ Auto-clean | 🎯 Keep outliers for fraud detection | ⚙️ Custom rules",
      },
      {
        id: "step_3",
        order: 3,
        title: "Exploratory Analysis",
        description: "I'll find patterns, correlations, and trends",
        action: "Statistical analysis + correlation matrix",
        expectedOutcome: "Key finding: Revenue correlates 0.85 with customer_age",
        aiAssistance: "I'll highlight: strongest correlations, anomalies, time trends",
        userInput: "✓ Continue | 📊 Show me age distribution | 🔍 Segment by region",
      },
      {
        id: "step_4",
        order: 4,
        title: "Visualize Insights",
        description: "Create charts that tell the story",
        action: "Generate: scatter plots, histograms, time series, heatmaps",
        expectedOutcome: "5 interactive charts showing revenue drivers",
        aiAssistance: "I'll choose optimal chart types for each insight",
        userInput: "✓ Perfect | 🎨 Use company colors | 📈 Add trendlines",
      },
      {
        id: "step_5",
        order: 5,
        title: "Recommendations",
        description: "Based on data, here's what you should do next",
        action: "Generate actionable recommendations",
        expectedOutcome: "3 recommendations: Target 25-34 age group, expand in APAC, optimize pricing",
        aiAssistance: "I'll prioritize by potential impact and feasibility",
        userInput: "✓ Export report | 💬 Explain APAC finding | 🔄 Re-run with Q4 data",
      },
    ],
    nextQuestion: "Would you like me to focus on any specific metric or time period?",
  };
}

/**
 * WRITE CONTENT - Intelligent Path
 */
export function createContentWritingPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "write_content",
    detectedIntent: breadcrumb.goalState || "Create engaging content that converts",
    startingPoint: breadcrumb.currentState || "Topic idea or brief",
    endingPoint: "Published-ready content with SEO optimization",
    estimatedTime: "30 minutes",
    difficulty: "easy",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Audience & Angle",
        description: "Who are we writing for and what's our unique angle?",
        action: "Define target audience, pain points, and content angle",
        expectedOutcome: "Audience: B2B SaaS founders | Angle: Cost reduction strategies",
        aiAssistance: "I'll suggest angles based on trending topics and competitor gaps",
        userInput: "✓ Sounds good | 🎯 Target CTOs instead | 💡 Add security angle",
      },
      {
        id: "step_2",
        order: 2,
        title: "Research & Outline",
        description: "I'll research the topic and create a structure",
        action: "Find trending keywords, competitor content, and build outline",
        expectedOutcome: "Outline: 5 sections, 15 keywords, 3 data points to include",
        aiAssistance: "I'll analyze top 10 ranking articles and find content gaps",
        userInput: "✓ Great outline | ➕ Add case study section | 🔄 Reorder sections",
      },
      {
        id: "step_3",
        order: 3,
        title: "Write Draft",
        description: "Creating engaging content with your brand voice",
        action: "Write introduction, body, and conclusion",
        expectedOutcome: "1,500-word draft with hook, examples, and CTA",
        aiAssistance: "I'll match your tone: professional, casual, or technical",
        userInput: "✓ Perfect tone | 📝 More casual | 💼 Add more data",
      },
      {
        id: "step_4",
        order: 4,
        title: "SEO Optimization",
        description: "Making it rank on Google",
        action: "Add keywords naturally, optimize headings, meta description",
        expectedOutcome: "SEO score: 85/100 | Keywords placed strategically",
        aiAssistance: "I'll ensure keyword density, readability, and structure",
        userInput: "✓ Looks good | 🔍 Target different keyword | 📊 Check competitors",
      },
      {
        id: "step_5",
        order: 5,
        title: "Final Polish",
        description: "Grammar, clarity, and flow check",
        action: "Proofread, improve transitions, strengthen CTAs",
        expectedOutcome: "Publication-ready article with 0 grammar errors",
        aiAssistance: "I'll check: grammar, readability (Grade 8), engagement",
        userInput: "✓ Publish | 📧 Create email version | 🔗 Generate social posts",
      },
    ],
    nextQuestion: "What tone should I use: professional, conversational, or technical?",
  };
}

/**
 * GENERATE CODE - Intelligent Path
 */
export function createCodeGenerationPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "generate_code",
    detectedIntent: breadcrumb.goalState || "Working, tested code solution",
    startingPoint: breadcrumb.currentState || "Problem description or requirements",
    endingPoint: "Production-ready code with tests and documentation",
    estimatedTime: "20 minutes",
    difficulty: "medium",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Requirements Analysis",
        description: "Let me understand exactly what you need",
        action: "Parse requirements, identify edge cases, clarify ambiguities",
        expectedOutcome: "Clear spec: Input (JSON), Output (CSV), Handle 10k+ rows",
        aiAssistance: "I'll ask clarifying questions to avoid rework",
        userInput: "✓ Correct | 🎯 Also handle XML input | ⚙️ Max 1M rows",
      },
      {
        id: "step_2",
        order: 2,
        title: "Architecture Design",
        description: "Choosing the best approach for your use case",
        action: "Select: language, libraries, design pattern, data structures",
        expectedOutcome: "Design: Python + pandas | Streaming for memory efficiency",
        aiAssistance: "I'll suggest optimal tech stack based on requirements",
        userInput: "✓ Perfect | 🔄 Use Node.js instead | 💡 Add caching layer",
      },
      {
        id: "step_3",
        order: 3,
        title: "Implementation",
        description: "Writing clean, documented code",
        action: "Code with error handling, logging, type hints",
        expectedOutcome: "150 lines of code | 95% coverage | Handles edge cases",
        aiAssistance: "I'll follow best practices and your coding style",
        userInput: "✓ Ship it | 🐛 Bug in line 47 | 📝 Add more comments",
      },
      {
        id: "step_4",
        order: 4,
        title: "Testing",
        description: "Comprehensive test suite",
        action: "Unit tests, integration tests, edge case tests",
        expectedOutcome: "20 tests | All passing | 95% code coverage",
        aiAssistance: "I'll test: happy path, errors, edge cases, performance",
        userInput: "✓ All tests pass | ➕ Add performance test | 🔍 Test with real data",
      },
      {
        id: "step_5",
        order: 5,
        title: "Documentation",
        description: "Usage guide and API docs",
        action: "Write README, docstrings, usage examples",
        expectedOutcome: "Complete docs with 3 examples and API reference",
        aiAssistance: "I'll document: setup, usage, common issues, API",
        userInput: "✓ Ready to use | 📦 Create npm package | 🚀 Deploy to AWS",
      },
    ],
    nextQuestion: "What programming language do you prefer, or should I choose the best one?",
  };
}

/**
 * BUILD APPS - Intelligent Path
 */
export function createAppBuildingPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "build_apps",
    detectedIntent: breadcrumb.goalState || "Launch a working MVP",
    startingPoint: breadcrumb.currentState || "App idea or problem to solve",
    endingPoint: "Deployed app with users",
    estimatedTime: breadcrumb.constraints?.includes("time_sensitive") ? "2 days" : "1 week",
    difficulty: "hard",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Product Definition",
        description: "What are we building and for whom?",
        action: "Define: target users, core features, success metrics",
        expectedOutcome: "MVP scope: 5 core features, target: freelancers, metric: 100 signups",
        aiAssistance: "I'll help prioritize features and cut scope for faster launch",
        userInput: "✓ Let's build this | 🎯 Add payment feature | ✂️ Remove social login",
      },
      {
        id: "step_2",
        order: 2,
        title: "Tech Stack",
        description: "Choosing technologies for speed and scale",
        action: "Select: frontend, backend, database, hosting",
        expectedOutcome: "Stack: Next.js + Supabase + Vercel | Setup time: 1 hour",
        aiAssistance: "I'll recommend based on: speed, cost, scalability, your skills",
        userInput: "✓ Good choice | 🔄 Use Firebase instead | 💡 Add Redis cache",
      },
      {
        id: "step_3",
        order: 3,
        title: "UI/UX Design",
        description: "Designing user flows and screens",
        action: "Create: wireframes, user flows, design system",
        expectedOutcome: "8 screens designed | User flow mapped | Component library",
        aiAssistance: "I'll design following: Tailwind, accessibility, mobile-first",
        userInput: "✓ Love it | 🎨 Use brand colors | 📱 Simplify mobile view",
      },
      {
        id: "step_4",
        order: 4,
        title: "Development",
        description: "Building frontend + backend simultaneously",
        action: "Code: UI components, API, database, auth",
        expectedOutcome: "Working app | All features functional | Auth integrated",
        aiAssistance: "I'll handle: routing, state, API calls, error handling",
        userInput: "✓ Works perfectly | 🐛 Fix signup bug | ➕ Add email notifications",
      },
      {
        id: "step_5",
        order: 5,
        title: "Testing & Launch",
        description: "QA, deployment, and first users",
        action: "Test, fix bugs, deploy, setup analytics",
        expectedOutcome: "Live at app.yourname.com | Analytics tracking | 0 critical bugs",
        aiAssistance: "I'll test across: browsers, devices, edge cases",
        userInput: "✓ Launch it | 🚀 Add to Product Hunt | 📧 Send to 10 beta users",
      },
      {
        id: "step_6",
        order: 6,
        title: "Iteration",
        description: "Learning from users and improving",
        action: "Collect feedback, prioritize fixes, ship updates",
        expectedOutcome: "Version 1.1 | 3 bugs fixed | 2 features added based on feedback",
        aiAssistance: "I'll analyze: user behavior, drop-off points, feature requests",
        userInput: "✓ Keep iterating | 📊 Show analytics | 💰 Add monetization",
      },
    ],
    nextQuestion: "Do you already have designs, or should I create the UI from scratch?",
  };
}

/**
 * RESEARCH TOPICS - Intelligent Path
 */
export function createResearchPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "research_topics",
    detectedIntent: breadcrumb.goalState || "Deep understanding with credible sources",
    startingPoint: "Topic or question",
    endingPoint: "Comprehensive research report with citations",
    estimatedTime: "45 minutes",
    difficulty: "medium",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Scope Definition",
        description: "What exactly are we researching?",
        action: "Define research questions, scope, depth needed",
        expectedOutcome: "3 research questions | Academic vs industry sources | Recency: last 2 years",
        aiAssistance: "I'll help narrow broad topics into specific answerable questions",
        userInput: "✓ Good scope | 🎯 Focus on recent studies | 📚 Include case studies",
      },
      {
        id: "step_2",
        order: 2,
        title: "Source Discovery",
        description: "Finding the most credible and relevant sources",
        action: "Search: academic papers, industry reports, expert opinions",
        expectedOutcome: "15 sources found | 8 peer-reviewed | 5 industry reports | 2 expert interviews",
        aiAssistance: "I'll prioritize: primary sources, recent publications, high citations",
        userInput: "✓ Great sources | ➕ Add government data | 🔍 Find opposing views",
      },
      {
        id: "step_3",
        order: 3,
        title: "Information Extraction",
        description: "Reading and extracting key findings",
        action: "Extract: main arguments, data points, methodologies, conclusions",
        expectedOutcome: "Key findings mapped | Conflicting viewpoints identified | Data points tagged",
        aiAssistance: "I'll highlight: consensus, disagreements, data quality, biases",
        userInput: "✓ Comprehensive | 📊 Focus on quantitative data | 💡 Flag contradictions",
      },
      {
        id: "step_4",
        order: 4,
        title: "Synthesis",
        description: "Connecting the dots across sources",
        action: "Identify patterns, trends, gaps in research",
        expectedOutcome: "5 major themes | 3 research gaps | Timeline of developments",
        aiAssistance: "I'll cross-reference findings and show evolution of thought",
        userInput: "✓ Makes sense | 🔄 Group differently | ➕ Add historical context",
      },
      {
        id: "step_5",
        order: 5,
        title: "Report Creation",
        description: "Professional research report with citations",
        action: "Write: executive summary, findings, methodology, bibliography",
        expectedOutcome: "15-page report | APA citations | Executive summary | Visual aids",
        aiAssistance: "I'll format in: APA, MLA, or Chicago style",
        userInput: "✓ Perfect | 📧 Create presentation version | 🔗 Add to Notion",
      },
    ],
    nextQuestion: "Do you need academic-level depth or business/practical focus?",
  };
}

/**
 * CREATE REPORTS - Intelligent Path
 */
export function createReportPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "create_reports",
    detectedIntent: breadcrumb.goalState || "Professional report for stakeholders",
    startingPoint: "Data or topic to report on",
    endingPoint: "Polished report ready to present",
    estimatedTime: "30 minutes",
    difficulty: "easy",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Audience & Purpose",
        description: "Who's reading this and what do they need?",
        action: "Define: audience (exec/technical), goal (inform/persuade), format",
        expectedOutcome: "Audience: C-suite | Goal: Get budget approval | Format: 5-page deck",
        aiAssistance: "I'll tailor depth and language to your audience",
        userInput: "✓ Right audience | 🎯 Add technical appendix | 📊 More visuals",
      },
      {
        id: "step_2",
        order: 2,
        title: "Data Gathering",
        description: "Collecting all relevant information",
        action: "Pull: metrics, KPIs, comparisons, supporting data",
        expectedOutcome: "Q4 revenue: $2M (+25%) | CAC: $150 (-10%) | Churn: 3% (flat)",
        aiAssistance: "I'll identify missing data and calculate derived metrics",
        userInput: "✓ Complete | 📈 Add YoY comparison | 🎯 Benchmark vs competitors",
      },
      {
        id: "step_3",
        order: 3,
        title: "Narrative Structure",
        description: "Building the story your data tells",
        action: "Create: situation, complication, resolution framework",
        expectedOutcome: "Story: Growth slowing → Competition → New market strategy",
        aiAssistance: "I'll craft compelling narrative from dry data",
        userInput: "✓ Strong story | 💡 Lead with opportunity | 🔄 Soften the bad news",
      },
      {
        id: "step_4",
        order: 4,
        title: "Visualization",
        description: "Charts that make your point instantly",
        action: "Create: charts, tables, infographics aligned to message",
        expectedOutcome: "5 charts | 2 comparison tables | 1 process diagram",
        aiAssistance: "I'll choose: chart types, colors, layouts for impact",
        userInput: "✓ Clear visuals | 🎨 Use brand colors | 📊 Simplify chart 3",
      },
      {
        id: "step_5",
        order: 5,
        title: "Final Polish",
        description: "Executive summary and recommendations",
        action: "Write: 1-page exec summary, clear recommendations, next steps",
        expectedOutcome: "Report complete | 3 recommendations | Action plan included",
        aiAssistance: "I'll ensure: clarity, professional tone, actionable insights",
        userInput: "✓ Send it | 📧 Email version | 📽️ Create presentation",
      },
    ],
    nextQuestion: "Is this for internal stakeholders or external clients?",
  };
}

/**
 * DRAFT EMAILS - Intelligent Path
 */
export function createEmailPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  return {
    taskType: "draft_emails",
    detectedIntent: breadcrumb.goalState || "Effective email that gets response",
    startingPoint: "Email purpose or context",
    endingPoint: "Ready-to-send email",
    estimatedTime: "10 minutes",
    difficulty: "easy",
    steps: [
      {
        id: "step_1",
        order: 1,
        title: "Email Strategy",
        description: "What's the goal and who's receiving it?",
        action: "Clarify: recipient, relationship, desired action, tone",
        expectedOutcome: "To: Sarah (VP Sales) | Goal: Schedule demo | Tone: Professional warm",
        aiAssistance: "I'll recommend approach based on relationship and goal",
        userInput: "✓ Right strategy | 🎯 Make it warmer | ⚡ More direct CTA",
      },
      {
        id: "step_2",
        order: 2,
        title: "Research Context",
        description: "Understanding the recipient and timing",
        action: "Check: LinkedIn, recent news, mutual connections, best timing",
        expectedOutcome: "Sarah just got promoted | Company raised Series B | Send Tuesday 10am",
        aiAssistance: "I'll find personalization hooks and optimal send time",
        userInput: "✓ Good research | 📅 Send Wednesday instead | ➕ Mention their product",
      },
      {
        id: "step_3",
        order: 3,
        title: "Draft Versions",
        description: "Multiple approaches to choose from",
        action: "Write: direct version, story version, value-first version",
        expectedOutcome: "3 email drafts | 5 subject lines | Each under 150 words",
        aiAssistance: "I'll vary: opening hook, value prop positioning, CTA strength",
        userInput: "✓ Use version 2 | 🔄 Combine hook from v1 | ✂️ Shorter",
      },
      {
        id: "step_4",
        order: 4,
        title: "Optimization",
        description: "Maximize open and response rate",
        action: "Optimize: subject line, preview text, CTA, signature",
        expectedOutcome: "Subject score: 8/10 | Reading level: Grade 7 | CTA clear",
        aiAssistance: "I'll A/B test insights and best practices",
        userInput: "✓ Perfect | 📧 Test subject line | 🔗 Add calendar link",
      },
      {
        id: "step_5",
        order: 5,
        title: "Follow-up Sequence",
        description: "Planning next steps if no response",
        action: "Draft: follow-up #1 (3 days), follow-up #2 (1 week), break-up email",
        expectedOutcome: "3 follow-ups ready | Timing automated | Trackable links",
        aiAssistance: "I'll write progressively stronger follow-ups",
        userInput: "✓ Send sequence | ⏰ Adjust timing | 🎯 Skip breakup email",
      },
    ],
    nextQuestion: "Is this cold outreach, warm introduction, or internal communication?",
  };
}

/**
 * Main function to generate intelligent path for any task type
 */
export function generateIntelligentPath(taskType: string, input: string): IntelligentPath {
  const breadcrumb = extractBreadcrumbs(input);

  switch (taskType) {
    case "analyze_data":       return createDataAnalysisPath(input, breadcrumb);
    case "write_content":      return createContentWritingPath(input, breadcrumb);
    case "generate_code":      return createCodeGenerationPath(input, breadcrumb);
    case "build_apps":         return createAppBuildingPath(input, breadcrumb);
    case "research_topics":    return createResearchPath(input, breadcrumb);
    case "create_reports":     return createReportPath(input, breadcrumb);
    case "draft_emails":       return createEmailPath(input, breadcrumb);
    case "job_application":    return createJobApplicationPath(input, breadcrumb);
    case "plan_strategies":    return createStrategyPath(input, breadcrumb);
    case "debug_code":         return createDebugPath(input, breadcrumb);
    case "design_systems":     return createSystemDesignPath(input, breadcrumb);
    case "optimize_workflows": return createWorkflowOptimizationPath(input, breadcrumb);
    case "audit_costs":        return createCostAuditPath(input, breadcrumb);
    case "shop_search":        return createShopSearchPath(input, breadcrumb);
    case "web_search":         return createWebSearchPath(input, breadcrumb);
    case "media_search":       return createMediaSearchPath(input, breadcrumb);
    default:                   return createDataAnalysisPath(input, breadcrumb);
  }
}

/**
 * JOB APPLICATION - Intelligent Path
 */
export function createJobApplicationPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  // Extract job/company details from input
  const jobMatch   = input.match(/(?:for|at|to)\s+([A-Z][a-zA-Z\s&]+?)(?:\s+as|\s+for|\s+position|$)/i);
  const roleMatch  = input.match(/(?:as\s+(?:a\s+)?|position\s+(?:of\s+)?)([a-zA-Z\s]+(?:engineer|developer|manager|designer|analyst|director|lead|specialist|consultant))/i);
  const company    = jobMatch?.[1]?.trim()  || "target company";
  const role       = roleMatch?.[1]?.trim() || "target role";

  return {
    taskType: "job_application",
    detectedIntent: breadcrumb.goalState || `Apply for ${role} at ${company}`,
    startingPoint: breadcrumb.currentState || "Resume and job posting ready",
    endingPoint: "Application submitted with tailored materials",
    estimatedTime: breadcrumb.constraints?.includes("time_sensitive") ? "20 minutes" : "1 hour",
    difficulty: "medium",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Analyse Job Posting",
        description: `Extract required skills, keywords, and culture signals from the ${company} posting`,
        action: `Parse job description for: required skills, nice-to-haves, keywords for ATS, culture indicators, red flags`,
        expectedOutcome: `Top 10 keywords to include | Must-have skills checklist | Culture fit signals`,
        aiAssistance: "I'll identify exact phrases the ATS and hiring manager are scanning for",
        userInput: "✓ Accurate analysis | ➕ Add skills I have | 🎯 Focus on technical requirements",
      },
      {
        id: "step_2", order: 2,
        title: "Tailor Resume",
        description: `Customise resume to match ${role} at ${company} — keyword alignment and achievement reframing`,
        action: `Rewrite summary, reorder bullet points, inject top ATS keywords, quantify achievements relevant to this role`,
        expectedOutcome: `ATS score: 85%+ | 3 tailored bullet points per role | Keywords integrated naturally`,
        aiAssistance: "I'll reframe existing experience using the job posting's language",
        userInput: "✓ Looks right | ✏️ Adjust experience section | 📄 Keep original format",
      },
      {
        id: "step_3", order: 3,
        title: "Write Cover Letter",
        description: `Compelling cover letter connecting your background to ${company}'s specific needs`,
        action: `Write: hook (company-specific insight), value paragraph (3 matching achievements), culture fit close, strong CTA`,
        expectedOutcome: `Cover letter: 280 words | Mentions ${company} specifically | Concrete achievement numbers`,
        aiAssistance: "I'll research the company to personalise the opening hook",
        userInput: "✓ Send it | 🔄 Make it shorter | 💬 More personal tone",
      },
      {
        id: "step_4", order: 4,
        title: "Prepare Application",
        description: "Fill out application form fields and prepare supporting materials",
        action: "Complete all form fields, attach tailored resume and cover letter, prepare portfolio links if needed",
        expectedOutcome: "Application 100% complete | All required fields filled | Attachments verified",
        aiAssistance: "I'll auto-fill standard fields from your resume data",
        userInput: "✓ Submit now | 📎 Add portfolio | 📝 Review before submit",
      },
      {
        id: "step_5", order: 5,
        title: "Follow-up Plan",
        description: "Track application and plan next contact",
        action: "Log application in tracker, set follow-up reminder (7 days), draft follow-up email template",
        expectedOutcome: "Application logged | Follow-up email drafted | Reminder set for next Tuesday",
        aiAssistance: "I'll draft a professional follow-up that doesn't come across as pushy",
        userInput: "✓ Done | 📅 Follow up sooner | 🔗 Connect on LinkedIn too",
      },
    ],
    nextQuestion: `Do you have a resume ready to tailor, or should I help build one from scratch for ${role}?`,
  };
}

/**
 * PLAN STRATEGIES - Intelligent Path
 */
export function createStrategyPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const topic = breadcrumb.context || input.replace(/plan|strategy|roadmap|for|my|our/gi, "").trim().slice(0, 60) || "your goal";

  return {
    taskType: "plan_strategies",
    detectedIntent: breadcrumb.goalState || `Strategic plan for ${topic}`,
    startingPoint: breadcrumb.currentState || "Current situation defined",
    endingPoint: "Actionable strategy with milestones and KPIs",
    estimatedTime: breadcrumb.constraints?.includes("time_sensitive") ? "30 minutes" : "2 hours",
    difficulty: "hard",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Situation Analysis",
        description: `Diagnose where you are now with ${topic} — strengths, weaknesses, opportunities, threats`,
        action: `Run SWOT analysis on ${topic}: internal strengths/weaknesses, external opportunities/threats, competitive position`,
        expectedOutcome: "SWOT matrix completed | Top 3 leverage points identified | Main risk flagged",
        aiAssistance: "I'll benchmark against industry standards and surface non-obvious patterns",
        userInput: "✓ Accurate | ➕ Add competitor context | 🎯 Focus on market opportunity",
      },
      {
        id: "step_2", order: 2,
        title: "Define Objectives",
        description: `Set SMART goals for ${topic} with measurable targets`,
        action: "Define: 90-day milestone, 6-month goal, 1-year vision. Assign KPIs to each with baseline and target values",
        expectedOutcome: "3 SMART goals | 8 KPIs with baselines | Success criteria documented",
        aiAssistance: "I'll convert vague goals into specific, measurable targets",
        userInput: "✓ Right targets | 🔢 Adjust numbers | ⏱️ Change timeline",
      },
      {
        id: "step_3", order: 3,
        title: "Generate Options",
        description: "Identify 3–5 strategic approaches with different risk/reward profiles",
        action: "Generate strategic options: aggressive growth, conservative optimisation, pivot alternatives. Score each on impact × feasibility",
        expectedOutcome: "5 strategic options scored | Recommended path highlighted | Trade-offs documented",
        aiAssistance: "I'll draw on analogous strategies from similar companies or situations",
        userInput: "✓ Pursue option 2 | 🔀 Combine options | ⚠️ Flag the risks",
      },
      {
        id: "step_4", order: 4,
        title: "Build Roadmap",
        description: "Break chosen strategy into phased execution plan",
        action: "Create 3-phase roadmap: Foundation (month 1–2), Growth (month 3–6), Scale (month 7–12). Assign owners and dependencies",
        expectedOutcome: "Phased roadmap | 15 action items | Owner and deadline per item | Dependencies mapped",
        aiAssistance: "I'll identify critical path and flag dependency risks",
        userInput: "✓ Looks right | 🔄 Reorder phases | 👥 Assign different owners",
      },
      {
        id: "step_5", order: 5,
        title: "Risk & Mitigation",
        description: "Identify what could go wrong and plan responses",
        action: "List top 5 risks by probability × impact, write mitigation plan per risk, define trigger conditions for plan-B",
        expectedOutcome: "Risk register with 5 entries | Mitigation action per risk | Early-warning indicators defined",
        aiAssistance: "I'll flag risks that are commonly underestimated in this type of strategy",
        userInput: "✓ Comprehensive | ➕ Add market risk | 🔄 Adjust probability scores",
      },
    ],
    nextQuestion: `What's the biggest obstacle you're facing right now with ${topic}?`,
  };
}

/**
 * DEBUG CODE - Intelligent Path
 */
export function createDebugPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const errorMatch = input.match(/(?:error|bug|issue|problem|fails?|broken)[\s:]+([^\n.]{5,60})/i);
  const langMatch  = input.match(/\b(python|javascript|typescript|react|node|java|go|rust|ruby|php|swift|kotlin|c\+\+|c#)\b/i);
  const errorDesc  = errorMatch?.[1]?.trim() || "the reported error";
  const lang       = langMatch?.[1] || "your codebase";

  return {
    taskType: "debug_code",
    detectedIntent: breadcrumb.goalState || `Fix ${errorDesc} in ${lang}`,
    startingPoint: breadcrumb.currentState || "Bug reproduced",
    endingPoint: "Bug fixed, tested, and root cause understood",
    estimatedTime: breadcrumb.constraints?.includes("time_sensitive") ? "15 minutes" : "45 minutes",
    difficulty: breadcrumb.constraints?.includes("complexity_low") ? "easy" : "medium",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Reproduce & Isolate",
        description: `Reliably reproduce "${errorDesc}" and narrow down which code triggers it`,
        action: `Write minimal reproduction case for "${errorDesc}" — identify exact inputs, environment, and conditions that trigger the bug`,
        expectedOutcome: `Bug reproduced in < 10 lines | Trigger conditions documented | Scope isolated to specific function/module`,
        aiAssistance: "I'll help strip away unrelated code to find the minimal failing case",
        userInput: "✓ Reproduced | 🔄 Intermittent — show me flaky test strategy | 📋 Paste error output",
      },
      {
        id: "step_2", order: 2,
        title: "Trace Execution",
        description: `Follow the code path in ${lang} that leads to the error`,
        action: "Add strategic logging/breakpoints at entry points, trace variable states through the call stack, identify where state diverges from expectation",
        expectedOutcome: "Execution path mapped | Variable state at each step | Exact line where logic breaks identified",
        aiAssistance: "I'll suggest optimal logging points to avoid noise while capturing the key state",
        userInput: "✓ Found the divergence | 📊 Show call stack | 🔍 Go deeper into this function",
      },
      {
        id: "step_3", order: 3,
        title: "Identify Root Cause",
        description: "Distinguish symptom from cause — find why it actually fails",
        action: "Apply 5-why analysis: trace from symptom to root cause, check for race conditions, off-by-one errors, null handling, type coercion, async ordering",
        expectedOutcome: "Root cause statement: 'X fails because Y when Z' | Contributing factors listed | Not just the symptom",
        aiAssistance: "I'll check for common patterns in this error class",
        userInput: "✓ That's the cause | 🤔 Not sure — dig deeper | ⚡ It's a timing issue",
      },
      {
        id: "step_4", order: 4,
        title: "Implement Fix",
        description: "Write the corrected code with proper error handling",
        action: "Write fix that addresses root cause (not just symptom), add null/edge case guards, maintain backward compatibility, add inline comment explaining why",
        expectedOutcome: "Fixed code | Edge cases handled | No regression in related paths | Comment explaining the fix",
        aiAssistance: "I'll check for similar patterns elsewhere in the codebase that may need the same fix",
        userInput: "✓ Looks right | 🔄 Alternative approach | ⚠️ Check this related function too",
      },
      {
        id: "step_5", order: 5,
        title: "Test & Verify",
        description: "Confirm fix works and no new bugs introduced",
        action: "Write: regression test for this exact bug, edge case tests, run existing test suite, verify fix in original environment",
        expectedOutcome: "Bug-specific test passes | No regressions in test suite | Fix verified in production-like environment",
        aiAssistance: "I'll generate test cases including the tricky edge cases most developers miss",
        userInput: "✓ All tests pass | 🔄 One test still failing | 📝 Add more edge cases",
      },
    ],
    nextQuestion: `Can you share the error message or the code that's failing?`,
  };
}

/**
 * DESIGN SYSTEMS - Intelligent Path
 */
export function createSystemDesignPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const systemMatch = input.match(/(?:design|architect|build|create)\s+(?:a\s+)?(?:system\s+for\s+|)?([a-zA-Z\s]{4,50}?)(?:\s+system|\s+architecture|\s+service|$)/i);
  const systemName  = systemMatch?.[1]?.trim() || "the system";

  return {
    taskType: "design_systems",
    detectedIntent: breadcrumb.goalState || `Architecture for ${systemName}`,
    startingPoint: breadcrumb.currentState || "Requirements gathered",
    endingPoint: "Complete architecture blueprint ready to implement",
    estimatedTime: "2–3 hours",
    difficulty: "hard",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Requirements Analysis",
        description: `Define functional and non-functional requirements for ${systemName}`,
        action: `List functional requirements (what it does), non-functional requirements for ${systemName}: scale targets (users/RPS), latency budget, availability SLA, consistency model, security constraints`,
        expectedOutcome: "10 functional requirements | 6 NFRs with numbers | Constraints documented | Trade-off priorities set",
        aiAssistance: "I'll surface implicit requirements and common oversights for this system type",
        userInput: "✓ Complete | ➕ Add compliance requirement | 🎯 Focus on read-heavy workload",
      },
      {
        id: "step_2", order: 2,
        title: "Capacity Estimation",
        description: "Calculate scale requirements to size the system correctly",
        action: `Estimate for ${systemName}: DAU, read/write ratio, storage growth, peak QPS, bandwidth needs. Use these to select appropriate infrastructure tier`,
        expectedOutcome: "Peak QPS calculated | Storage estimate for 3 years | Bandwidth budget | Infrastructure tier recommendation",
        aiAssistance: "I'll run back-of-envelope calculations and flag where estimates are uncertain",
        userInput: "✓ Estimates look right | 🔢 We expect 10x that | 📊 Show me the math",
      },
      {
        id: "step_3", order: 3,
        title: "High-Level Architecture",
        description: `Design the major components of ${systemName} and how they connect`,
        action: "Define: client tier, API gateway, core services, data stores, cache layer, message queue (if async), CDN. Draw data flow between components",
        expectedOutcome: "Architecture diagram | Component responsibilities defined | Data flow documented | Technology choices justified",
        aiAssistance: "I'll evaluate monolith vs microservices, sync vs async, SQL vs NoSQL for your specific requirements",
        userInput: "✓ Right approach | 🔀 Use event-driven instead | 📦 We already have X — integrate it",
      },
      {
        id: "step_4", order: 4,
        title: "Data Model & APIs",
        description: "Design the database schema and API contracts",
        action: "Design: entity relationships and schema, primary/secondary indexes, API endpoints (REST or GraphQL), request/response shapes, auth strategy",
        expectedOutcome: "DB schema with indexes | API spec with 8+ endpoints | Auth flow documented | Pagination strategy defined",
        aiAssistance: "I'll optimise indexes for your access patterns and flag N+1 query risks",
        userInput: "✓ Schema works | 🔄 Normalise differently | 🔑 Explain the auth flow",
      },
      {
        id: "step_5", order: 5,
        title: "Scalability & Resilience",
        description: "Design for failure — how the system handles load and outages",
        action: "Define: horizontal scaling strategy, caching layers and TTLs, circuit breakers, rate limiting, graceful degradation, disaster recovery RTO/RPO",
        expectedOutcome: "Scaling runbook | Failure mode analysis | Recovery time targets | Monitoring/alerting plan",
        aiAssistance: "I'll model failure scenarios and identify single points of failure",
        userInput: "✓ Comprehensive | ⚡ Add real-time requirements | 🌍 Multi-region needed",
      },
    ],
    nextQuestion: `What's the expected scale — how many users, and what's the read/write ratio?`,
  };
}

/**
 * OPTIMIZE WORKFLOWS - Intelligent Path
 */
export function createWorkflowOptimizationPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const workflowMatch = input.match(/(?:optimize|improve|automate|streamline)\s+(?:my\s+|our\s+|the\s+)?([a-zA-Z\s]{4,50}?)(?:\s+workflow|\s+process|\s+pipeline|$)/i);
  const workflowName  = workflowMatch?.[1]?.trim() || "workflow";

  return {
    taskType: "optimize_workflows",
    detectedIntent: breadcrumb.goalState || `Optimise ${workflowName}`,
    startingPoint: breadcrumb.currentState || "Current process documented",
    endingPoint: "Streamlined workflow with measurable time/cost savings",
    estimatedTime: breadcrumb.constraints?.includes("time_sensitive") ? "45 minutes" : "2 hours",
    difficulty: "medium",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Map Current Process",
        description: `Document every step in the current ${workflowName} — including the hidden ones`,
        action: `Create step-by-step flowchart of current ${workflowName}: every handoff, decision point, tool switch, waiting period, and manual touch. Note time and owner per step`,
        expectedOutcome: "Process map with 10–20 steps | Time per step | Owner per step | Tool used per step | Total cycle time",
        aiAssistance: "I'll ask the right questions to surface steps people forget to mention (the invisible work)",
        userInput: "✓ That's accurate | ➕ Add approval step | ⏱️ This step takes 3 days not 1",
      },
      {
        id: "step_2", order: 2,
        title: "Identify Waste & Bottlenecks",
        description: `Find the value-destroying parts of the ${workflowName}`,
        action: `Analyse process map for: waiting time (queue vs work ratio), rework loops, context switching, duplicate data entry, unnecessary approvals, manual steps that could be automated`,
        expectedOutcome: "Waste taxonomy: 5+ waste items categorised | Biggest bottleneck identified | % time in value-adding vs non-value-adding work",
        aiAssistance: "I'll apply Lean/TOC analysis and flag the constraint that limits overall throughput",
        userInput: "✓ Those are the problems | 🎯 Focus on the approval bottleneck | 🤖 Which can be automated?",
      },
      {
        id: "step_3", order: 3,
        title: "Design Optimised Process",
        description: "Redesign the workflow eliminating identified waste",
        action: `Redesign ${workflowName}: eliminate non-value steps, parallelize sequential steps, automate repetitive tasks, reduce handoffs, implement pull vs push flow where possible`,
        expectedOutcome: "Optimised process map | Steps reduced by X% | Cycle time reduction estimated | Automation candidates marked",
        aiAssistance: "I'll suggest specific tools and integrations that can automate each candidate step",
        userInput: "✓ Approve new design | 🔄 Keep the approval — it's required | 🛠️ What tools for automation?",
      },
      {
        id: "step_4", order: 4,
        title: "Calculate ROI",
        description: "Quantify the value of the improvements",
        action: "Calculate: time saved per week × hourly cost × team size, error rate reduction impact, customer satisfaction improvement, implementation cost and payback period",
        expectedOutcome: "Annual hours saved | Annual cost saved | Implementation cost | Payback period | Net ROI %",
        aiAssistance: "I'll build a conservative and optimistic scenario to give a realistic range",
        userInput: "✓ Convincing numbers | 🔢 Adjust the hourly rate | 📊 Show me the full model",
      },
      {
        id: "step_5", order: 5,
        title: "Implementation Roadmap",
        description: "Phased rollout plan with quick wins first",
        action: "Sequence improvements by: quick wins (week 1–2), medium changes (month 1), systemic changes (quarter 1). Define success metrics, rollback plan, training needs",
        expectedOutcome: "Phased implementation plan | Week 1 quick wins identified | KPIs to track | Training plan | Rollback triggers",
        aiAssistance: "I'll identify the one change that will have immediate visible impact to build momentum",
        userInput: "✓ Start implementation | ⚡ Do the quick wins now | 👥 Who needs training?",
      },
    ],
    nextQuestion: `What's the single most painful step in the current process?`,
  };
}

/**
 * AUDIT COSTS - Intelligent Path
 */
export function createCostAuditPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const scopeMatch = input.match(/audit\s+(?:my\s+|our\s+|the\s+)?([a-zA-Z\s]{4,50}?)(?:\s+costs?|\s+spend|\s+expenses?|\s+budget|$)/i);
  const scope      = scopeMatch?.[1]?.trim() || "cost";

  return {
    taskType: "audit_costs",
    detectedIntent: breadcrumb.goalState || `Audit and optimise ${scope} spend`,
    startingPoint: breadcrumb.currentState || "Expense data available",
    endingPoint: "Cost reduction plan with specific savings targets",
    estimatedTime: "1–2 hours",
    difficulty: "medium",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Inventory All Spend",
        description: `Catalogue every ${scope} cost — including the ones on autopay nobody reviews`,
        action: `List all ${scope} expenses: pull from bank statements, invoices, subscription management tools. Categorise: infrastructure, SaaS/tools, labour, vendors, overhead`,
        expectedOutcome: "Complete spend inventory | Categorised by type | Monthly recurring vs one-time | Total monthly burn by category",
        aiAssistance: "I'll flag common forgotten costs: annual subs, dormant accounts, usage-based overages",
        userInput: "✓ That's everything | ➕ Add payroll costs | 🔍 Export from our billing system first",
      },
      {
        id: "step_2", order: 2,
        title: "Benchmark & Compare",
        description: "Compare your spend to industry norms and your own history",
        action: `Benchmark ${scope} costs: compare to industry percentages of revenue, year-over-year trend, per-unit economics (cost per customer, per employee). Flag outliers`,
        expectedOutcome: "Industry benchmark comparison | YoY trend | Per-unit metrics | Top 5 outliers above benchmark",
        aiAssistance: "I'll pull industry benchmarks for your sector and company size",
        userInput: "✓ Useful comparisons | 📊 Show me per-employee breakdown | 🔢 Our revenue figure is X",
      },
      {
        id: "step_3", order: 3,
        title: "Find Waste & Overlap",
        description: "Identify spend that delivers no value",
        action: `Audit for waste in ${scope}: unused/underused subscriptions (< 20% seat utilisation), duplicate tools doing same job, over-provisioned infrastructure, zombie resources, negotiable contracts coming up for renewal`,
        expectedOutcome: "Waste list with dollar amount | Duplicate tool pairs identified | Infrastructure right-sizing opportunities | Contracts to renegotiate",
        aiAssistance: "I'll check your stack against common redundancy patterns",
        userInput: "✓ Those are real savings | ❌ We actually use that | 📅 When does that contract expire?",
      },
      {
        id: "step_4", order: 4,
        title: "Identify Alternatives",
        description: "Find cheaper options for necessary spend",
        action: `Research alternatives for top 5 cost items: open-source replacements, competing vendors, tier downgrades, reserved/committed pricing discounts, consolidation opportunities`,
        expectedOutcome: "Alternative per top-5 cost item | Savings estimate | Switching effort score | Risk level",
        aiAssistance: "I'll research current pricing and common negotiation wins for each vendor",
        userInput: "✓ Good options | ❌ Can't switch — vendor lock-in | 💬 Need to negotiate not switch",
      },
      {
        id: "step_5", order: 5,
        title: "Savings Roadmap",
        description: "Prioritised action plan ordered by savings vs effort",
        action: "Rank all savings opportunities by: annual savings ÷ implementation effort. Build 30/60/90-day action plan. Assign owner per action. Set tracking cadence",
        expectedOutcome: `Total addressable savings identified | 30-day quick wins | 90-day plan | Monthly savings tracking template`,
        aiAssistance: "I'll calculate the savings multiple — how many hours of effort per $1,000 saved",
        userInput: "✓ Start with quick wins | 📋 Export to spreadsheet | 📅 Schedule vendor calls",
      },
    ],
    nextQuestion: `What's your approximate monthly spend in this area, and where do you think the biggest waste is?`,
  };
}

/**
 * SHOP SEARCH - Intelligent Path
 */
export function createShopSearchPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  // Extract product and retailer from input
  const retailerMatch = input.match(/\b(target|amazon|walmart|ebay|etsy|zara|h&m|nike|adidas|nordstrom|bestbuy|costco|shein|asos)\b/i);
  const retailer      = retailerMatch?.[1] || "the requested store";
  const productMatch  = input.replace(/find|me|best|deal|deals|on|at|from|search|for|get|buy|shop/gi, "").trim();
  const product       = productMatch.slice(0, 60) || "product";

  return {
    taskType: "shop_search",
    detectedIntent: `Find the best deal on ${product} at ${retailer}`,
    startingPoint: "Search query",
    endingPoint: "Best deal identified with direct link",
    estimatedTime: "5 minutes",
    difficulty: "easy",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Parse Request",
        description: `Extract exactly what to find: product type, size/specs, budget, preferred brand for "${product}" at ${retailer}`,
        action: `From the request "${input}" — identify: exact product, any size/colour/spec constraints, max price if mentioned, brand preference`,
        expectedOutcome: `Product spec card: item="${product}", retailer=${retailer}, constraints=any mentioned`,
        aiAssistance: "I'll infer unstated preferences (e.g. if 'shirts' → check Men's/Women's, size range)",
        userInput: "✓ Correct | 🎯 Specific size: M | 💰 Budget: under $20",
      },
      {
        id: "step_2", order: 2,
        title: "Search Products",
        description: `Search ${retailer} for ${product} matching the spec`,
        action: `Search ${retailer} for "${product}" — retrieve current listings, prices, availability, ratings`,
        expectedOutcome: `10–20 matching results with: name, price, rating, availability, URL`,
        aiAssistance: "I'll search current listings including sale and clearance sections",
        userInput: "✓ Good results | 🔄 Different colour | 📦 In-store only",
      },
      {
        id: "step_3", order: 3,
        title: "Find Active Deals",
        description: `Check for coupons, loyalty discounts, and promotional pricing at ${retailer}`,
        action: `Check: ${retailer} loyalty program discounts (e.g. Target Circle), current promo codes, clearance pricing, buy-more-save offers`,
        expectedOutcome: `Active deals list: promo codes, % off with loyalty card, clearance items`,
        aiAssistance: "I'll stack applicable discounts to find the true lowest price",
        userInput: "✓ Apply all deals | 🎫 I have Target Circle | ❌ Skip promo codes",
      },
      {
        id: "step_4", order: 4,
        title: "Compare & Rank",
        description: "Rank results by value — price, quality, reviews, availability",
        action: `Score each result: price vs budget, star rating ≥ 4, in-stock status, return policy. Rank by value score`,
        expectedOutcome: `Top 5 ranked options with: final price after deals, rating, pros/cons`,
        aiAssistance: "I'll weight rating and return policy alongside price for true value",
        userInput: "✓ Good ranking | ⭐ Prioritise rating | 💰 Cheapest first",
      },
      {
        id: "step_5", order: 5,
        title: "Recommend Best Pick",
        description: "Present the top recommendation with all deal details and a direct link",
        action: `Select the #1 pick — state final price after all discounts, why it wins, direct product URL, how to apply any coupon`,
        expectedOutcome: `Best pick: [name] at $[price] (was $[original]) — [direct link] — apply code [X] at checkout`,
        aiAssistance: "I'll include the exact steps to complete the purchase at the lowest price",
        userInput: "✓ Buy it | 🔄 Show me #2 option | 📋 Show full comparison",
      },
    ],
    nextQuestion: `What's your budget and do you need a specific size or style for the ${product}?`,
  };
}

/**
 * WEB SEARCH - Intelligent Path
 */
export function createWebSearchPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const subject = input
    .replace(/^(find\s+(me\s+)?|search\s+(for\s+)?|look\s+up\s+|get\s+me\s+|show\s+me\s+|tell\s+me\s+)/i, "")
    .trim()
    .slice(0, 80) || "the requested information";

  return {
    taskType: "web_search",
    detectedIntent: breadcrumb.goalState || `Find: ${subject}`,
    startingPoint: "Search query",
    endingPoint: "Verified, summarised answer with sources",
    estimatedTime: "3–5 minutes",
    difficulty: "easy",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Formulate Queries",
        description: `Break "${subject}" into the most effective search terms`,
        action: `Convert "${input}" into 3 optimised search queries: exact phrase, broader term, alternative phrasing`,
        expectedOutcome: `3 search queries ready | Target sources identified (official sites, news, databases)`,
        aiAssistance: "I'll use query operators and synonyms to maximise relevant results",
        userInput: "✓ Good queries | ➕ Also search [X] | 🎯 Only from official sources",
      },
      {
        id: "step_2", order: 2,
        title: "Search & Retrieve",
        description: "Execute searches and collect top results",
        action: `Run all 3 queries, retrieve top 5 results per query, deduplicate, rank by relevance and recency`,
        expectedOutcome: `10–15 unique results with: title, source, date, snippet`,
        aiAssistance: "I'll prioritise official, authoritative, and recent sources",
        userInput: "✓ Good sources | 🗓️ Only last 6 months | 📚 Academic sources preferred",
      },
      {
        id: "step_3", order: 3,
        title: "Verify & Filter",
        description: "Check credibility and filter out low-quality results",
        action: `Score each result: source authority, publication date, factual consistency across sources. Remove duplicates and unreliable sources`,
        expectedOutcome: `5–8 verified, credible results | Conflicting info flagged`,
        aiAssistance: "I'll cross-check facts that appear in only one source",
        userInput: "✓ Looks reliable | ⚠️ Flag that source | 🔍 Dig deeper into [X]",
      },
      {
        id: "step_4", order: 4,
        title: "Synthesise Answer",
        description: `Compile a clear, direct answer to "${subject}"`,
        action: `Synthesise findings into: direct answer (1–2 sentences), key supporting details, important caveats, all sources cited`,
        expectedOutcome: `Clear answer | Key points | Sources with links | Confidence level`,
        aiAssistance: "I'll lead with the most certain information and clearly label anything uncertain",
        userInput: "✓ That answers it | 📋 More detail | 🔗 Open the source",
      },
    ],
    nextQuestion: `Is there a specific aspect of "${subject}" you want me to focus on?`,
  };
}

/**
 * MEDIA SEARCH - Intelligent Path
 * Returns curated links — Claude constructs accurate platform URLs and
 * recommends known playlists/channels rather than pretending to browse.
 */
export function createMediaSearchPath(input: string, breadcrumb: PathBreadcrumb): IntelligentPath {
  const platformMatch = input.match(/\b(youtube|spotify|netflix|apple\s*music|soundcloud|tidal|deezer|twitch|hulu|disney\+?)\b/i);
  const platform      = platformMatch?.[1]?.toLowerCase().replace(/\s+/, "") || "youtube";

  const mediaMatch = input
    .replace(/^(play|watch|listen\s*(to)?|stream|put\s+on|queue|find|search|get)\s+/i, "")
    .replace(/(on|at|from)\s+(youtube|spotify|netflix|apple\s*music|soundcloud|tidal|deezer|twitch|hulu|disney\+?)/i, "")
    .trim();
  const query = mediaMatch.slice(0, 80) || "requested content";

  const platformUrls: Record<string, (q: string) => string> = {
    youtube:    q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    spotify:    q => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
    soundcloud: q => `https://soundcloud.com/search?q=${encodeURIComponent(q)}`,
    netflix:    q => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`,
    twitch:     q => `https://www.twitch.tv/search?term=${encodeURIComponent(q)}`,
    applemusic: q => `https://music.apple.com/search?term=${encodeURIComponent(q)}`,
  };
  const searchUrl = (platformUrls[platform] ?? platformUrls["youtube"])(query);

  return {
    taskType: "media_search",
    detectedIntent: `Find "${query}" on ${platform}`,
    startingPoint: "Media request",
    endingPoint: "Curated links ready to play",
    estimatedTime: "< 1 minute",
    difficulty: "easy",
    steps: [
      {
        id: "step_1", order: 1,
        title: "Parse Media Request",
        description: `Identify exactly what media is wanted from: "${input}"`,
        action: `Extract from "${input}": content type (music/video/podcast), genre/mood, specific artist or show if named, platform preference`,
        expectedOutcome: `Content: "${query}" | Platform: ${platform} | Type: music/video | Any artist/mood constraints`,
        aiAssistance: "I'll infer genre and mood from keywords like 'lofi', 'chill', 'hype', 'study'",
        userInput: "✓ Correct | 🎵 Different genre | 📺 Different platform",
      },
      {
        id: "step_2", order: 2,
        title: "Generate Search Links",
        description: `Build direct search URLs on ${platform} for "${query}"`,
        action: `Construct search URLs for "${query}" on ${platform}. Include: main search, genre-specific search, mood-based alternatives.\n\nPrimary search URL: ${searchUrl}`,
        expectedOutcome: `3–5 clickable search URLs on ${platform} covering the request and close alternatives`,
        aiAssistance: "I'll construct URLs using each platform's search format — these open directly to results",
        userInput: "✓ Good links | 🔄 Try different terms | 📱 Mobile app link instead",
      },
      {
        id: "step_3", order: 3,
        title: "Recommend Top Picks",
        description: `Recommend known ${platform} channels, playlists or content matching "${query}"`,
        action: `List 5 well-known ${platform} channels/playlists/artists for "${query}". For each provide: name, why it matches, direct URL if known, what to expect`,
        expectedOutcome: `5 recommendations with: name | description | direct link | content style`,
        aiAssistance: "I'll draw on known popular channels and playlists for this genre",
        userInput: "✓ Open the first one | 🔄 Show more options | 🎧 Different mood",
      },
    ],
    nextQuestion: `Are you looking for a specific artist, or just the vibe — like "${query}"?`,
  };
}