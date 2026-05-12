// lib/browser-tools.ts
// Browser tool definitions for Claude's tool use API.
// Claude calls these tools, the executor relays them to the extension,
// extension performs real actions in the user's Chrome, results come back.
import { SWEEP_INCREMENT } from './workflow-engine';

export const BROWSER_TOOLS = [
  {
    name: "browser_navigate",
    description: "Open a URL in the browser. Use this to navigate to any website.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to navigate to, e.g. https://linkedin.com/login" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_get_content",
    description: "Read the current page content — title, full text, links, inputs, buttons. Use this after navigating to understand what's on the page.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser_click",
    description: "Click an element on the page by its text label or CSS selector.",
    input_schema: {
      type: "object",
      properties: {
        text:     { type: "string", description: "Visible text of the element to click, e.g. 'Sign in', 'Apply Now', 'Add to cart'" },
        selector: { type: "string", description: "CSS selector as fallback, e.g. '#login-btn', '.submit-button'" },
      },
    },
  },
  {
    name: "browser_type",
    description: "Type text into an input field. Finds the field by placeholder, label, or selector.",
    input_schema: {
      type: "object",
      properties: {
        text:     { type: "string", description: "Text to type" },
        selector: { type: "string", description: "CSS selector or field name, e.g. '#email', 'input[name=password]'" },
        clear:    { type: "boolean", description: "Clear existing value first. Default true." },
      },
      required: ["text"],
    },
  },
  {
    name: "browser_key",
    description: "Press a keyboard key, e.g. Enter to submit a form, Tab to move focus, Escape to close.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key name: 'Enter', 'Tab', 'Escape', 'ArrowDown', etc." },
      },
      required: ["key"],
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page to reveal more content.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["down", "up"], description: "Scroll direction" },
        amount:    { type: "number", description: `Pixels to scroll. Default ${SWEEP_INCREMENT}px (SWEEP_INCREMENT).` },
      },
    },
  },
  {
    name: "browser_wait",
    description: "Wait for a page to load or an action to complete. Use after clicking buttons that trigger navigation.",
    input_schema: {
      type: "object",
      properties: {
        seconds: { type: "number", description: "Seconds to wait. Default 2, max 10." },
      },
    },
  },
  {
    name: "browser_open_tab",
    description: "Open a URL in a new tab within the same browser. Use this when you need to visit multiple websites simultaneously. Each tab is independent.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Full URL to open in new tab, e.g. https://techcrunch.com" },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_close_tab",
    description: "Close a specific tab by its ID. Use browser_list_tabs first to get tab IDs.",
    input_schema: {
      type: "object",
      properties: {
        tabId: { type: "string", description: "The ID of the tab to close. If not provided, closes the active tab." },
      },
    },
  },
  {
    name: "browser_switch_tab",
    description: "Switch to a different tab in the same browser. Use browser_list_tabs to see all open tabs and their IDs.",
    input_schema: {
      type: "object",
      properties: {
        tabId: { type: "string", description: "The ID of the tab to switch to." },
      },
      required: ["tabId"],
    },
  },
  {
    name: "browser_list_tabs",
    description: "List all open tabs in the current browser. Returns tab IDs, URLs, titles, bookmark status, and which tab is active. Use this before switching or closing tabs.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "browser_mark_done",
    description: "Mark a tab as done/bookmarked when you've extracted the information you need. The user will see bookmarked tabs and can choose to keep or close them. Use after completing a task on a tab.",
    input_schema: {
      type: "object",
      properties: {
        tabId: { type: "string", description: "The ID of the tab to mark as done. If not provided, marks the active tab." },
        done: { type: "boolean", description: "true to mark as done/bookmarked, false to unmark. Default true." },
      },
    },
  },
  {
    name: "browser_get_tab",
    description: "Get detailed information about a specific tab including its URL, title, status, bookmark state, and whether it's the active tab.",
    input_schema: {
      type: "object",
      properties: {
        tabId: { type: "string", description: "The ID of the tab to get info about. If not provided, returns info for the active tab." },
      },
    },
  },
];

// Tool names for type safety
export type BrowserToolName =
  | "browser_navigate"
  | "browser_get_content"
  | "browser_click"
  | "browser_type"
  | "browser_key"
  | "browser_scroll"
  | "browser_wait"
  | "browser_open_tab"
  | "browser_close_tab"
  | "browser_switch_tab"
  | "browser_list_tabs"
  | "browser_mark_done"
  | "browser_get_tab";