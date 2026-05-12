// chrome-extension/config.js
// Production configuration for Pushpa browser extension

const CONFIG = {
  // Server connection (SSE + POST — no WebSocket)
  server: {
    baseUrl: 'http://localhost:3000',
    sseEndpoint:        '/api/browser',
    screenshotEndpoint: '/api/browser-preview',
    reconnectAttempts: 10,
    reconnectDelayBase: 1000,  // ms, doubles each attempt up to 15s
    screenshotOnNav: true,     // auto-screenshot after every page load
  },

  // Action execution
  automation: {
    defaultTimeout: 30000,
    findElementTimeout: 10000,
    pageLoadTimeout: 30000,
    typingSpeed: 75,            // ms per character
    humanDelay: {
      min: 100,
      max: 500
    }
  },

  // Site handlers
  handlers: {
    linkedin: {
      enabled: true,
      priority: 10
    },
    indeed: {
      enabled: true,
      priority: 9
    },
    aws: {
      enabled: true,
      priority: 8
    },
    lovable: {
      enabled: true,
      priority: 7
    },
    v0: {
      enabled: true,
      priority: 7
    },
    figma: {
      enabled: true,
      priority: 6
    },
    amazon: {
      enabled: true,
      priority: 5
    },
    generic: {
      enabled: true,
      priority: 0
    }
  },

  // Security
  security: {
    allowedOrigins: [
      'http://localhost:3000',
      'https://Pushpa.ai',
      'https://*.Pushpa.ai'
    ],
    maxActionQueueSize: 100,
    requireApproval: true,
    blockDangerousSelectors: true
  },

  // Debug
  debug: {
    enabled: process.env.NODE_ENV !== 'production',
    logLevel: 'info',           // 'debug' | 'info' | 'warn' | 'error'
    highlightElements: true,
    showNotifications: true
  },

  // Features
  features: {
    aiVisionFallback: true,
    smartFormFill: true,
    autoDetectAuth: true,
    multiStepForms: true,
    errorRecovery: true
  },

  // Rate limiting
  rateLimit: {
    maxActionsPerMinute: 60,
    maxActionsPerHour: 1000,
    cooldownPeriod: 1000        // ms between actions
  },

  // Storage
  storage: {
    maxHistoryItems: 100,
    retentionDays: 30,
    syncEnabled: false
  }
};

// Validate config
function validateConfig() {
  if (!CONFIG.server.baseUrl) {
    throw new Error('Server base URL is required');
  }

  if (CONFIG.rateLimit.maxActionsPerMinute < 1) {
    throw new Error('Rate limit must be at least 1 action per minute');
  }

  console.log('[Config] Validation passed');
}

// Export config
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

if (typeof window !== 'undefined') {
  window.Pushpa_CONFIG = CONFIG;
}

// Validate on load
validateConfig();
