// chrome-extension/handlers/linkedin.js
// Production-grade LinkedIn automation handler

class LinkedInHandler {
  constructor() {
    this.name = 'LinkedIn';
    this.selectors = {
      // Auth
      loginButton: 'a[href*="/login"]',
      profileNav: '.global-nav__me',
      
      // Job search
      jobSearchInput: 'input[aria-label="Search by title, skill, or company"]',
      jobSearchButton: 'button[aria-label="Search"]',
      jobCard: '.job-search-card',
      easyApplyButton: '.jobs-apply-button',
      
      // Application form
      firstName: 'input[id*="firstName"]',
      lastName: 'input[id*="lastName"]',
      email: 'input[type="email"]',
      phone: 'input[type="tel"]',
      resumeUpload: 'input[type="file"][name*="resume"]',
      
      // Navigation
      nextButton: 'button[aria-label*="Continue"]',
      submitButton: 'button[aria-label*="Submit"]',
      reviewButton: 'button[aria-label*="Review"]',
    };
  }

  canHandle(actionType) {
    const supported = [
      'search_jobs',
      'apply_to_job',
      'fill_application',
      'submit_application'
    ];
    return supported.includes(actionType);
  }

  async execute(action) {
    switch (action.type) {
      case 'search_jobs':
        return await this.searchJobs(action.value);
      case 'apply_to_job':
        return await this.applyToJob(action.value);
      case 'fill_application':
        return await this.fillApplication(action.value);
      default:
        throw new Error(`Unsupported action: ${action.type}`);
    }
  }

  async checkAuth() {
    // Check if user is logged in
    const profileNav = document.querySelector(this.selectors.profileNav);
    
    if (!profileNav) {
      return {
        needsAuth: true,
        site: 'LinkedIn',
        message: 'Please log in to LinkedIn to continue',
        loginUrl: 'https://www.linkedin.com/login'
      };
    }
    
    return { needsAuth: false };
  }

  async searchJobs(query) {
    // Type in search box
    const searchInput = document.querySelector(this.selectors.jobSearchInput);
    if (!searchInput) {
      throw new Error('Search input not found');
    }
    
    searchInput.value = query;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Click search button
    const searchButton = document.querySelector(this.selectors.jobSearchButton);
    if (searchButton) {
      searchButton.click();
    } else {
      // Submit form
      searchInput.form.submit();
    }
    
    // Wait for results
    await this.waitForElement(this.selectors.jobCard, 5000);
    
    // Scrape job listings
    const jobs = this.scrapeJobListings();
    
    return {
      success: true,
      jobs,
      count: jobs.length
    };
  }

  scrapeJobListings() {
    const jobCards = document.querySelectorAll(this.selectors.jobCard);
    const jobs = [];
    
    jobCards.forEach((card, index) => {
      try {
        const title = card.querySelector('.job-search-card__title')?.textContent?.trim();
        const company = card.querySelector('.job-search-card__company-name')?.textContent?.trim();
        const location = card.querySelector('.job-search-card__location')?.textContent?.trim();
        const link = card.querySelector('a')?.href;
        const easyApply = card.querySelector(this.selectors.easyApplyButton) !== null;
        
        if (title && company) {
          jobs.push({
            id: `linkedin_${index}`,
            title,
            company,
            location,
            link,
            easyApply,
            source: 'LinkedIn'
          });
        }
      } catch (error) {
        console.warn('Failed to parse job card:', error);
      }
    });
    
    return jobs;
  }

  async applyToJob(jobUrl) {
    // Navigate to job if needed
    if (window.location.href !== jobUrl) {
      window.location.href = jobUrl;
      await this.waitForPageLoad();
    }
    
    // Click Easy Apply button
    const applyButton = await this.waitForElement(this.selectors.easyApplyButton, 5000);
    
    if (!applyButton) {
      return {
        success: false,
        error: 'Easy Apply not available for this job'
      };
    }
    
    applyButton.click();
    
    // Wait for modal
    await this.waitForElement('.jobs-easy-apply-modal', 3000);
    
    return {
      success: true,
      modalOpen: true
    };
  }

  async fillApplication(userData) {
    const results = [];
    
    // Fill basic fields
    const fieldsToFill = [
      { selector: this.selectors.firstName, value: userData.firstName, name: 'First Name' },
      { selector: this.selectors.lastName, value: userData.lastName, name: 'Last Name' },
      { selector: this.selectors.email, value: userData.email, name: 'Email' },
      { selector: this.selectors.phone, value: userData.phone, name: 'Phone' }
    ];
    
    for (const field of fieldsToFill) {
      try {
        const element = document.querySelector(field.selector);
        if (element) {
          element.value = field.value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          results.push({ field: field.name, success: true });
        }
      } catch (error) {
        results.push({ field: field.name, success: false, error: error.message });
      }
    }
    
    // Upload resume if provided
    if (userData.resume) {
      try {
        const resumeInput = document.querySelector(this.selectors.resumeUpload);
        if (resumeInput) {
          // Trigger file input (user will select manually)
          resumeInput.click();
          results.push({ field: 'Resume', success: true, note: 'User will select file' });
        }
      } catch (error) {
        results.push({ field: 'Resume', success: false, error: error.message });
      }
    }
    
    // Handle multi-step forms
    await this.handleMultiStepForm();
    
    return {
      success: true,
      results,
      readyToSubmit: this.isReadyToSubmit()
    };
  }

  async handleMultiStepForm() {
    // Auto-answer common questions
    const commonAnswers = {
      'Are you authorized to work': 'Yes',
      'Do you require sponsorship': 'No',
      'Years of experience': userData.yearsExperience || '3'
    };
    
    // Look for radio buttons, checkboxes, select dropdowns
    const questions = document.querySelectorAll('.jobs-easy-apply-form-section');
    
    questions.forEach(section => {
      const questionText = section.querySelector('label')?.textContent;
      
      for (const [question, answer] of Object.entries(commonAnswers)) {
        if (questionText?.includes(question)) {
          // Auto-select answer
          this.selectAnswer(section, answer);
        }
      }
    });
  }

  selectAnswer(section, answer) {
    // Try radio buttons
    const radios = section.querySelectorAll('input[type="radio"]');
    radios.forEach(radio => {
      if (radio.value === answer || radio.nextElementSibling?.textContent?.includes(answer)) {
        radio.click();
      }
    });
    
    // Try select dropdown
    const select = section.querySelector('select');
    if (select) {
      Array.from(select.options).forEach(option => {
        if (option.textContent.includes(answer)) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
  }

  isReadyToSubmit() {
    // Check if on final step
    const submitButton = document.querySelector(this.selectors.submitButton);
    const reviewButton = document.querySelector(this.selectors.reviewButton);
    
    return !!(submitButton || reviewButton);
  }

  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  }

  waitForPageLoad() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve, { once: true });
      }
    });
  }

  getSelectors() {
    return this.selectors;
  }
}

// Generic fallback handler for unknown sites
class GenericHandler {
  constructor() {
    this.name = 'Generic';
  }

  canHandle(actionType) {
    return true; // Can attempt any action
  }

  async execute(action) {
    // Use generic automation methods
    return {
      success: false,
      error: 'Site-specific handler not available. Please use AI vision mode.'
    };
  }

  async checkAuth() {
    return { needsAuth: false };
  }

  getSelectors() {
    return {};
  }
}

// Stub handlers for other sites (to be expanded)
class IndeedHandler extends GenericHandler {
  constructor() {
    super();
    this.name = 'Indeed';
  }
}

class AWSHandler extends GenericHandler {
  constructor() {
    super();
    this.name = 'AWS Console';
  }
}

class LovableHandler extends GenericHandler {
  constructor() {
    super();
    this.name = 'Lovable';
  }
}

class V0Handler extends GenericHandler {
  constructor() {
    super();
    this.name = 'v0.dev';
  }
}

class FigmaHandler extends GenericHandler {
  constructor() {
    super();
    this.name = 'Figma';
  }
}

class AmazonHandler extends GenericHandler {
  constructor() {
    super();
    this.name = 'Amazon';
  }
}
