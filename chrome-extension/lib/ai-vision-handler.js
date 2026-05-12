// chrome-extension/lib/ai-vision-handler.js
// Real-time AI Vision Automation - Works on ANY website

class AIVisionHandler {
  constructor() {
    this.maxSteps = 50; // Per slave node
    this.costPerCall = 0.002;
    this.totalCost = 0;
  }

  /**
   * Execute a slave node goal using pure AI vision
   * Integrates with existing master-slave architecture
   */
  async executeSlave(slaveNode, userContext = {}) {
    console.log(`[AI Vision] Executing slave: ${slaveNode.name}`);
    
    const goal = slaveNode.aiVision?.goal || slaveNode.description;
    let step = 0;
    let complete = false;
    const actionLog = [];
    let consecutiveFailures = 0;
    let lastAction = null;
    
    while (!complete && step < this.maxSteps) {
      try {
        // 1. Capture current state
        const screenshot = await this.captureScreen();
        const pageState = await this.getPageState();
        
        // 2. Check if stuck (same action 3 times in a row)
        if (consecutiveFailures >= 3) {
          console.warn('[AI Vision] Stuck after 3 failures, asking for help');
          return {
            status: 'waiting_user',
            message: `I'm having trouble with: ${goal}. The last action (${lastAction}) didn't work. Can you help or should I try a different approach?`,
            cost: this.totalCost,
            log: actionLog,
            recoverable: true
          };
        }
        
        // 3. Ask Claude Vision what to do (include user context + error context)
        const decision = await this.askClaudeVision({
          screenshot,
          pageState,
          goal,
          stepNumber: step,
          previousActions: actionLog.slice(-3),
          userContext,
          lastFailure: consecutiveFailures > 0 ? lastAction : null
        });
        
        actionLog.push({
          step: step + 1,
          action: decision.action,
          reasoning: decision.reasoning,
          timestamp: Date.now()
        });
        
        // 4. Execute action with error handling
        try {
          const result = await this.executeAction(decision);
          
          if (result.success) {
            consecutiveFailures = 0; // Reset on success
          } else {
            consecutiveFailures++;
            lastAction = decision.action;
            console.warn(`[AI Vision] Action failed (${consecutiveFailures}/3):`, result.reason);
            
            // If action failed, try alternative approach
            if (consecutiveFailures === 2) {
              console.log('[AI Vision] Trying alternative approach on next attempt');
            }
          }
        } catch (actionError) {
          consecutiveFailures++;
          lastAction = decision.action;
          console.error('[AI Vision] Action error:', actionError);
          
          // Don't fail immediately, let AI Vision try different approach
          if (consecutiveFailures < 3) {
            continue;
          }
        }
        
        // 5. Check completion
        if (decision.action === 'goal_achieved') {
          complete = true;
        }
        
        if (decision.action === 'need_user') {
          // Pause for user (auth, approval, etc.)
          return {
            status: 'waiting_user',
            message: decision.message,
            cost: this.totalCost,
            log: actionLog
          };
        }
        
        // Human-like delay
        await this.sleep(300 + Math.random() * 200);
        step++;
        
      } catch (error) {
        console.error('[AI Vision] Step error:', error);
        consecutiveFailures++;
        
        // If Vision API itself failed, retry with backoff
        if (error.message?.includes('API') || error.message?.includes('fetch')) {
          await this.sleep(1000 * consecutiveFailures); // Exponential backoff
        }
        
        if (consecutiveFailures >= 3) {
          return {
            status: 'failed',
            error: error.message,
            message: 'I encountered technical errors. Please try again or contact support.',
            cost: this.totalCost,
            log: actionLog,
            recoverable: true
          };
        }
      }
    }
    
    if (step >= this.maxSteps && !complete) {
      return {
        status: 'failed',
        error: 'Max steps reached',
        message: `I couldn't complete "${goal}" within ${this.maxSteps} steps. The task might be too complex or something unexpected happened.`,
        cost: this.totalCost,
        log: actionLog,
        recoverable: true
      };
    }
    
    return {
      status: complete ? 'complete' : 'failed',
      output: actionLog[actionLog.length - 1],
      cost: this.totalCost,
      steps: step,
      log: actionLog
    };
  }

  /**
   * Ask Claude Vision API for next action
   */
  async askClaudeVision({ screenshot, pageState, goal, stepNumber, previousActions, userContext = {}, lastFailure = null }) {
    const previousContext = previousActions.map(a => 
      `Step ${a.step}: ${a.action} - ${a.reasoning}`
    ).join('\n');

    // Get API key from chrome.storage (set by service worker)
    const { ANTHROPIC_API_KEY } = await chrome.storage.local.get(['ANTHROPIC_API_KEY']);
    
    if (!ANTHROPIC_API_KEY) {
      throw new Error('API key not available. Make sure extension is connected to backend.');
    }
    
    // Build user context string
    const userContextStr = Object.keys(userContext).length > 0 
      ? `\n\nUSER INFORMATION (use this to fill forms):
${Object.entries(userContext).map(([key, val]) => `- ${key}: ${val}`).join('\n')}`
      : '';
    
    // Build error recovery context
    const errorContextStr = lastFailure 
      ? `\n\n⚠️ ERROR RECOVERY MODE:
The previous action "${lastFailure}" failed or didn't work as expected.
Please try a DIFFERENT approach. Consider:
- Using different coordinates
- Trying alternative elements
- Scrolling to reveal hidden elements
- Waiting for page to load completely
- Using keyboard shortcuts instead of clicking`
      : '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot
              }
            },
            {
              type: 'text',
              text: `You are a browser automation AI analyzing screenshots in real-time.

SLAVE NODE GOAL: "${goal}"

CURRENT PAGE:
- URL: ${pageState.url}
- Title: ${pageState.title}
- Step: ${stepNumber + 1}

PREVIOUS ACTIONS:
${previousContext || 'This is the first step'}${userContextStr}${errorContextStr}

Analyze the screenshot and decide the NEXT action to achieve this specific goal.

ACTIONS AVAILABLE:
- click: Click element at coordinates
- type: Type text into field
- scroll: Scroll page
- wait: Wait for element
- navigate: Go to URL
- need_user: User must login/approve
- goal_achieved: This slave node goal is complete

RESPOND WITH ONLY JSON:
{
  "action": "click|type|scroll|wait|navigate|need_user|goal_achieved",
  "x": number (pixel x coordinate, null if not applicable),
  "y": number (pixel y coordinate, null if not applicable),
  "text": "text to type" (null if not typing),
  "url": "url" (null if not navigating),
  "message": "message for user" (null unless need_user),
  "reasoning": "why this action achieves the goal"
}

CRITICAL RULES:
1. If you see a login page, return need_user with message
2. If this specific goal is done, return goal_achieved
3. Give EXACT pixel coordinates by analyzing the screenshot
4. One action at a time - be precise
5. When filling forms, use the USER INFORMATION provided above
6. If stuck after 3 attempts, return need_user asking for help
7. If in ERROR RECOVERY MODE, try a completely different approach`
            }
          ]
        }]
      })
    });

    const data = await response.json();
    this.totalCost += this.costPerCall;
    
    // Send cost update to backend for real-time tracking
    this.sendCostUpdate({
      visionCalls: 1,
      screenshots: 1,
      actualCost: this.totalCost
    });
    
    // Parse JSON from Claude's response
    const jsonMatch = data.content[0].text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude did not return valid JSON');
    }
    
    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Execute the decided action
   */
  async executeAction(decision) {
    console.log(`[AI Vision] Executing: ${decision.action}`, decision);
    
    switch (decision.action) {
      case 'click':
        return await this.clickAt(decision.x, decision.y);
        
      case 'type':
        return await this.typeAt(decision.x, decision.y, decision.text);
        
      case 'scroll':
        return await this.scrollPage(decision.direction || 'down');
        
      case 'wait':
        return await this.sleep(2000);
        
      case 'navigate':
        return await this.navigate(decision.url);
        
      case 'need_user':
      case 'goal_achieved':
        return { success: true };
        
      default:
        throw new Error(`Unknown action: ${decision.action}`);
    }
  }

  /**
   * Click at specific coordinates
   */
  async clickAt(x, y) {
    const element = document.elementFromPoint(x, y);
    
    if (!element) {
      console.warn(`[AI Vision] No element at (${x}, ${y})`);
      return { success: false, reason: 'no_element' };
    }
    
    // Highlight element briefly
    const originalBorder = element.style.border;
    element.style.border = '3px solid #FF6B00';
    element.style.transition = 'border 0.2s';
    
    setTimeout(() => {
      element.style.border = originalBorder;
    }, 500);
    
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(200);
    
    // Click
    element.click();
    
    console.log(`[AI Vision] Clicked at (${x}, ${y})`);
    return { success: true, element: element.tagName };
  }

  /**
   * Type text at coordinates
   */
  async typeAt(x, y, text) {
    const element = document.elementFromPoint(x, y);
    
    if (!element || !['INPUT', 'TEXTAREA'].includes(element.tagName)) {
      console.warn(`[AI Vision] Not an input at (${x}, ${y})`);
      return { success: false, reason: 'not_input' };
    }
    
    // Focus element
    element.focus();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(200);
    
    // Clear existing
    element.value = '';
    
    // Type character by character (human-like)
    for (const char of text) {
      element.value += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await this.sleep(50 + Math.random() * 50);
    }
    
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    console.log(`[AI Vision] Typed "${text}" at (${x}, ${y})`);
    return { success: true, text };
  }

  /**
   * Scroll page
   */
  async scrollPage(direction) {
    const scrollAmount = 500;
    
    if (direction === 'down') {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else if (direction === 'up') {
      window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    }
    
    await this.sleep(500);
    return { success: true, direction };
  }

  /**
   * Navigate to URL
   */
  async navigate(url) {
    window.location.href = url;
    await this.waitForPageLoad();
    return { success: true, url };
  }

  /**
   * Capture screenshot of current page
   */
  async captureScreen() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'capture_screenshot' },
        (response) => {
          if (response && response.dataUrl) {
            // Remove data:image/png;base64, prefix
            const base64 = response.dataUrl.split(',')[1];
            resolve(base64);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Get current page state
   */
  async getPageState() {
    return {
      url: window.location.href,
      title: document.title,
      readyState: document.readyState,
      scrollY: window.scrollY,
      innerHeight: window.innerHeight
    };
  }

  /**
   * Wait for page to load
   */
  waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get total cost so far
   */
  getTotalCost() {
    return this.totalCost;
  }

  /**
   * Reset cost counter
   */
  resetCost() {
    this.totalCost = 0;
  }

  /**
   * Send cost update to backend for real-time tracking
   */
  sendCostUpdate(update) {
    // Send via WebSocket to backend
    chrome.runtime.sendMessage({
      type: 'cost_update',
      payload: {
        visionCalls: update.visionCalls || 0,
        screenshots: update.screenshots || 0,
        actualCost: update.actualCost || this.totalCost,
        slaveId: this.currentSlaveId,
        slaveName: this.currentSlaveName
      }
    });
  }

  /**
   * Set current slave context for cost tracking
   */
  setSlaveContext(slaveId, slaveName) {
    this.currentSlaveId = slaveId;
    this.currentSlaveName = slaveName;
  }

  /**
   * Send screenshot to browser preview
   */
  sendScreenshotToPreview(screenshot, action) {
    // Send via WebSocket to backend
    chrome.runtime.sendMessage({
      type: 'screenshot_preview',
      payload: {
        screenshot,
        action: {
          type: action?.action,
          x: action?.x,
          y: action?.y
        },
        slaveId: this.currentSlaveId,
        slaveName: this.currentSlaveName
      }
    });
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.AIVisionHandler = AIVisionHandler;
}
