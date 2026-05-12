// chrome-extension/lib/selector-engine.js
// Production-grade intelligent element selector

class SelectorEngine {
  constructor() {
    this.strategies = [
      this.byId,
      this.byName,
      this.byAriaLabel,
      this.byPlaceholder,
      this.byType,
      this.byText,
      this.byClass,
      this.byDataAttribute,
      this.byRole
    ];
  }

  /**
   * Find element using multiple strategies
   * @param {Object} target - Target description
   * @returns {Element|null}
   */
  findElement(target) {
    // If target is a CSS selector, use it directly
    if (typeof target === 'string') {
      return document.querySelector(target);
    }
    
    // Try each strategy until one succeeds
    for (const strategy of this.strategies) {
      const element = strategy.call(this, target);
      if (element) {
        console.log('[SelectorEngine] Found element using strategy:', strategy.name);
        return element;
      }
    }
    
    // Last resort: AI-powered search
    return this.aiSearch(target);
  }

  /**
   * Find all matching elements
   */
  findElements(target) {
    if (typeof target === 'string') {
      return Array.from(document.querySelectorAll(target));
    }
    
    // Collect results from all strategies
    const results = new Set();
    
    for (const strategy of this.strategies) {
      const elements = strategy.call(this, target, true);
      if (elements) {
        elements.forEach(el => results.add(el));
      }
    }
    
    return Array.from(results);
  }

  // Strategy 1: Find by ID
  byId(target, findAll = false) {
    if (target.id) {
      return document.getElementById(target.id);
    }
    return null;
  }

  // Strategy 2: Find by name attribute
  byName(target, findAll = false) {
    if (target.name) {
      const elements = document.getElementsByName(target.name);
      return findAll ? Array.from(elements) : elements[0];
    }
    return null;
  }

  // Strategy 3: Find by aria-label
  byAriaLabel(target, findAll = false) {
    if (target.ariaLabel) {
      const selector = `[aria-label*="${target.ariaLabel}" i]`;
      return findAll 
        ? Array.from(document.querySelectorAll(selector))
        : document.querySelector(selector);
    }
    return null;
  }

  // Strategy 4: Find by placeholder
  byPlaceholder(target, findAll = false) {
    if (target.placeholder) {
      const selector = `[placeholder*="${target.placeholder}" i]`;
      return findAll
        ? Array.from(document.querySelectorAll(selector))
        : document.querySelector(selector);
    }
    return null;
  }

  // Strategy 5: Find by type
  byType(target, findAll = false) {
    if (target.type) {
      const selector = `input[type="${target.type}"]`;
      return findAll
        ? Array.from(document.querySelectorAll(selector))
        : document.querySelector(selector);
    }
    return null;
  }

  // Strategy 6: Find by text content
  byText(target, findAll = false) {
    if (target.text) {
      const xpath = `//*[contains(text(), "${target.text}")]`;
      const result = document.evaluate(
        xpath,
        document,
        null,
        findAll ? XPathResult.ORDERED_NODE_SNAPSHOT_TYPE : XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      
      if (findAll) {
        const elements = [];
        for (let i = 0; i < result.snapshotLength; i++) {
          elements.push(result.snapshotItem(i));
        }
        return elements;
      }
      
      return result.singleNodeValue;
    }
    return null;
  }

  // Strategy 7: Find by class
  byClass(target, findAll = false) {
    if (target.className) {
      const elements = document.getElementsByClassName(target.className);
      return findAll ? Array.from(elements) : elements[0];
    }
    return null;
  }

  // Strategy 8: Find by data attribute
  byDataAttribute(target, findAll = false) {
    if (target.dataAttribute) {
      const [key, value] = Object.entries(target.dataAttribute)[0];
      const selector = `[data-${key}="${value}"]`;
      return findAll
        ? Array.from(document.querySelectorAll(selector))
        : document.querySelector(selector);
    }
    return null;
  }

  // Strategy 9: Find by ARIA role
  byRole(target, findAll = false) {
    if (target.role) {
      const selector = `[role="${target.role}"]`;
      return findAll
        ? Array.from(document.querySelectorAll(selector))
        : document.querySelector(selector);
    }
    return null;
  }

  // Last resort: AI-powered search
  aiSearch(target) {
    console.warn('[SelectorEngine] Falling back to AI search for:', target);
    
    // Take screenshot and use Claude Vision to locate element
    // This would be implemented in Phase 2 with backend integration
    return null;
  }

  /**
   * Generate smart selector for element
   * @param {Element} element 
   * @returns {string}
   */
  generateSelector(element) {
    // Prefer ID
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Use name
    if (element.name) {
      return `[name="${element.name}"]`;
    }
    
    // Use aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `[aria-label="${ariaLabel}"]`;
    }
    
    // Use data-testid (common in React apps)
    const testId = element.getAttribute('data-testid');
    if (testId) {
      return `[data-testid="${testId}"]`;
    }
    
    // Generate nth-child path
    return this.generateNthChildPath(element);
  }

  generateNthChildPath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;
      
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current) + 1;
      const tagName = current.tagName.toLowerCase();
      
      path.unshift(`${tagName}:nth-child(${index})`);
      current = parent;
    }
    
    return path.join(' > ');
  }

  /**
   * Validate if selector is stable
   */
  isStableSelector(selector) {
    // Selectors using ID, name, aria-label are stable
    const stablePatterns = [
      /^#/,                    // ID
      /^\[name=/,              // Name
      /^\[aria-label=/,        // ARIA label
      /^\[data-testid=/        // Test ID
    ];
    
    return stablePatterns.some(pattern => pattern.test(selector));
  }

  /**
   * Wait for element to appear
   */
  async waitForElement(target, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = this.findElement(target);
      
      if (element) {
        return element;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Timeout waiting for element: ${JSON.stringify(target)}`);
  }

  /**
   * Find form fields intelligently
   */
  findFormFields(formElement) {
    const fields = {};
    const inputs = formElement.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
      // Skip submit buttons
      if (input.type === 'submit' || input.type === 'button') {
        return;
      }
      
      // Determine field purpose
      const purpose = this.detectFieldPurpose(input);
      
      if (purpose) {
        fields[purpose] = {
          element: input,
          type: input.type || input.tagName.toLowerCase(),
          required: input.required,
          selector: this.generateSelector(input)
        };
      }
    });
    
    return fields;
  }

  detectFieldPurpose(input) {
    const name = (input.name || '').toLowerCase();
    const id = (input.id || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
    const label = this.getInputLabel(input);
    
    const combined = `${name} ${id} ${placeholder} ${ariaLabel} ${label}`.toLowerCase();
    
    // Email detection
    if (combined.includes('email') || input.type === 'email') {
      return 'email';
    }
    
    // Phone detection
    if (combined.includes('phone') || combined.includes('tel') || input.type === 'tel') {
      return 'phone';
    }
    
    // Name detection
    if (combined.includes('first') && combined.includes('name')) {
      return 'firstName';
    }
    if (combined.includes('last') && combined.includes('name')) {
      return 'lastName';
    }
    if (combined.includes('full') && combined.includes('name')) {
      return 'fullName';
    }
    
    // Address detection
    if (combined.includes('address') || combined.includes('street')) {
      return 'address';
    }
    if (combined.includes('city')) {
      return 'city';
    }
    if (combined.includes('state')) {
      return 'state';
    }
    if (combined.includes('zip') || combined.includes('postal')) {
      return 'zipCode';
    }
    
    // Resume/file upload
    if (input.type === 'file' && (combined.includes('resume') || combined.includes('cv'))) {
      return 'resume';
    }
    
    return null;
  }

  getInputLabel(input) {
    // Find associated label
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent;
    }
    
    // Check parent label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      return parentLabel.textContent;
    }
    
    return '';
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.SelectorEngine = SelectorEngine;
}
