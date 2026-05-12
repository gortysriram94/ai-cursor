// lib/production/error-handler.ts
// Production-grade error handling and recovery

export class TokenLiftError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
    public userMessage?: string
  ) {
    super(message);
    this.name = 'TokenLiftError';
  }
}

export const ErrorCodes = {
  // Browser Extension Errors
  EXTENSION_NOT_CONNECTED: 'EXTENSION_NOT_CONNECTED',
  EXTENSION_TIMEOUT: 'EXTENSION_TIMEOUT',
  BROWSER_ACTION_FAILED: 'BROWSER_ACTION_FAILED',
  ELEMENT_NOT_FOUND: 'ELEMENT_NOT_FOUND',
  
  // Authentication Errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // API Errors
  API_KEY_INVALID: 'API_KEY_INVALID',
  API_RATE_LIMIT: 'API_RATE_LIMIT',
  API_QUOTA_EXCEEDED: 'API_QUOTA_EXCEEDED',
  
  // Task Execution Errors
  TASK_VALIDATION_FAILED: 'TASK_VALIDATION_FAILED',
  SLAVE_EXECUTION_FAILED: 'SLAVE_EXECUTION_FAILED',
  MASTER_COORDINATION_FAILED: 'MASTER_COORDINATION_FAILED',
  
  // User Input Errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  
  // System Errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export class ErrorHandler {
  private static errorLog: Array<{
    timestamp: number;
    error: TokenLiftError;
    context: any;
  }> = [];

  static handle(error: unknown, context?: any): TokenLiftError {
    const tokenLiftError = this.normalize(error);
    
    // Log error
    this.errorLog.push({
      timestamp: Date.now(),
      error: tokenLiftError,
      context
    });
    
    // Console log in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('[TokenLift Error]', tokenLiftError, context);
    }
    
    return tokenLiftError;
  }

  private static normalize(error: unknown): TokenLiftError {
    if (error instanceof TokenLiftError) {
      return error;
    }
    
    if (error instanceof Error) {
      // Map common errors to TokenLiftError
      if (error.message.includes('fetch failed')) {
        return new TokenLiftError(
          error.message,
          ErrorCodes.NETWORK_ERROR,
          true,
          'Network connection failed. Please check your internet and try again.'
        );
      }
      
      if (error.message.includes('timeout')) {
        return new TokenLiftError(
          error.message,
          ErrorCodes.TIMEOUT,
          true,
          'Request timed out. Please try again.'
        );
      }
      
      return new TokenLiftError(
        error.message,
        ErrorCodes.UNKNOWN_ERROR,
        false,
        'An unexpected error occurred. Please try again or contact support.'
      );
    }
    
    return new TokenLiftError(
      String(error),
      ErrorCodes.UNKNOWN_ERROR,
      false,
      'An unexpected error occurred.'
    );
  }

  static async retry<T>(
    fn: () => Promise<T>,
    options: {
      maxAttempts?: number;
      delay?: number;
      backoff?: boolean;
    } = {}
  ): Promise<T> {
    const maxAttempts = options.maxAttempts || 3;
    const baseDelay = options.delay || 1000;
    const backoff = options.backoff !== false;
    
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts) {
          const delay = backoff ? baseDelay * Math.pow(2, attempt - 1) : baseDelay;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw this.handle(lastError, { maxAttempts, attempts: maxAttempts });
  }

  static getErrorLog(): typeof ErrorHandler.errorLog {
    return this.errorLog;
  }

  static clearErrorLog(): void {
    this.errorLog = [];
  }
}

// Input Validation
export class InputValidator {
  static validateTaskInput(input: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!input || input.trim().length === 0) {
      errors.push('Task input cannot be empty');
    }
    
    if (input.length > 5000) {
      errors.push('Task input too long (max 5000 characters)');
    }
    
    // Check for potential injection attacks
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i, // Event handlers
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(input))) {
      errors.push('Input contains potentially dangerous content');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static validateFile(file: File): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Max file size: 50MB
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      errors.push(`File too large (max 50MB, got ${Math.round(file.size / 1024 / 1024)}MB)`);
    }
    
    // Allowed file types
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      errors.push(`File type not allowed: ${file.type}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  static sanitizeInput(input: string): string {
    return input
      .trim()
      .replace(/<script.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }
}

// Rate Limiting
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside window
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
    
    if (validRequests.length >= limit) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    
    return true;
  }

  reset(key: string): void {
    this.requests.delete(key);
  }
}

// Security Headers
export function getSecurityHeaders(): HeadersInit {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
}

// CORS Configuration
export function getCORSHeaders(origin?: string): HeadersInit {
  const allowedOrigins = [
    'http://localhost:3000',
    'https://tokenlift.ai',
    'https://*.tokenlift.ai'
  ];
  
  const isAllowed = origin && allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = new RegExp('^' + allowed.replace('*', '.*') + '$');
      return pattern.test(origin);
    }
    return allowed === origin;
  });
  
  if (!isAllowed) {
    return {};
  }
  
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// Monitoring
export class Monitor {
  private static metrics: Map<string, number[]> = new Map();

  static track(metricName: string, value: number): void {
    const values = this.metrics.get(metricName) || [];
    values.push(value);
    
    // Keep last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
    
    this.metrics.set(metricName, values);
  }

  static getMetrics(metricName: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    const values = this.metrics.get(metricName) || [];
    
    if (values.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  static getAllMetrics(): Record<string, ReturnType<typeof Monitor.getMetrics>> {
    const result: Record<string, ReturnType<typeof Monitor.getMetrics>> = {};
    
    this.metrics.forEach((_, metricName) => {
      result[metricName] = this.getMetrics(metricName);
    });
    
    return result;
  }
}
