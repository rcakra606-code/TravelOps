/**
 * Error Monitoring with Sentry Integration
 * Automatically captures and reports JavaScript errors
 */

(function() {
  'use strict';

  // Configuration
  const SENTRY_DSN = window.SENTRY_DSN || ''; // Set via environment or config
  const ENVIRONMENT = window.location.hostname.includes('localhost') ? 'development' : 'production';
  const SAMPLE_RATE = ENVIRONMENT === 'production' ? 0.1 : 1.0; // Sample 10% in production
  
  // Error queue for offline storage
  const ERROR_QUEUE_KEY = 'error-queue';
  const MAX_QUEUE_SIZE = 50;
  
  // Initialize error monitoring
  class ErrorMonitor {
    constructor() {
      this.errors = [];
      this.initialized = false;
      this.sentryLoaded = false;
      this.init();
    }
    
    init() {
      // Global error handler
      window.onerror = (message, source, lineno, colno, error) => {
        this.captureError({
          type: 'uncaught',
          message,
          source,
          lineno,
          colno,
          stack: error?.stack,
          timestamp: new Date().toISOString()
        });
        return false; // Allow default handling
      };
      
      // Unhandled promise rejection handler
      window.addEventListener('unhandledrejection', (event) => {
        this.captureError({
          type: 'unhandledrejection',
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack,
          timestamp: new Date().toISOString()
        });
      });
      
      // Network error handler
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const start = performance.now();
        try {
          const response = await originalFetch(...args);
          const duration = performance.now() - start;
          
          // Log slow API calls
          if (duration > 3000) {
            this.captureMetric({
              type: 'slow_api',
              url: args[0],
              duration,
              status: response.status
            });
          }
          
          // Log failed API calls (except auth failures)
          if (!response.ok && response.status !== 401 && response.status !== 403) {
            this.captureError({
              type: 'api_error',
              url: args[0],
              status: response.status,
              duration,
              timestamp: new Date().toISOString()
            });
          }
          
          return response;
        } catch (error) {
          this.captureError({
            type: 'network_error',
            url: args[0],
            message: error.message,
            timestamp: new Date().toISOString()
          });
          throw error;
        }
      };
      
      // Load Sentry if DSN is configured
      if (SENTRY_DSN) {
        this.loadSentry();
      }
      
      // Send queued errors on page load
      this.flushQueue();
      
      this.initialized = true;
    }
    
    loadSentry() {
      const script = document.createElement('script');
      script.src = 'https://browser.sentry-cdn.com/7.91.0/bundle.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (window.Sentry) {
          window.Sentry.init({
            dsn: SENTRY_DSN,
            environment: ENVIRONMENT,
            sampleRate: SAMPLE_RATE,
            tracesSampleRate: SAMPLE_RATE,
            integrations: [new window.Sentry.BrowserTracing()],
            beforeSend(event) {
              // Filter out known third-party errors
              if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
                return null;
              }
              return event;
            }
          });
          this.sentryLoaded = true;
          
          // Set user context if logged in
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          if (user.id) {
            window.Sentry.setUser({ id: user.id, username: user.username });
          }
        }
      };
      document.head.appendChild(script);
    }
    
    captureError(error) {
      // Sample errors in production
      if (ENVIRONMENT === 'production' && Math.random() > SAMPLE_RATE) {
        return;
      }
      
      // Add context
      error.url = window.location.href;
      error.userAgent = navigator.userAgent;
      error.user = JSON.parse(localStorage.getItem('user') || '{}').username;
      
      // Send to Sentry if available
      if (this.sentryLoaded && window.Sentry) {
        window.Sentry.captureException(new Error(error.message), {
          extra: error
        });
      }
      
      // Queue for later if offline
      if (!navigator.onLine) {
        this.queueError(error);
        return;
      }
      
      // Log locally in development
      if (ENVIRONMENT === 'development') {
        console.error('[ErrorMonitor]', error);
      }
      
      // Send to custom endpoint if configured
      if (window.ERROR_ENDPOINT) {
        this.sendError(error);
      }
    }
    
    captureMetric(metric) {
      metric.url = window.location.href;
      metric.user = JSON.parse(localStorage.getItem('user') || '{}').username;
      metric.timestamp = new Date().toISOString();
      
      // Send to Sentry as breadcrumb
      if (this.sentryLoaded && window.Sentry) {
        window.Sentry.addBreadcrumb({
          category: 'performance',
          message: `${metric.type}: ${metric.url}`,
          level: 'info',
          data: metric
        });
      }
    }
    
    queueError(error) {
      try {
        const queue = JSON.parse(localStorage.getItem(ERROR_QUEUE_KEY) || '[]');
        queue.push(error);
        
        // Limit queue size
        while (queue.length > MAX_QUEUE_SIZE) {
          queue.shift();
        }
        
        localStorage.setItem(ERROR_QUEUE_KEY, JSON.stringify(queue));
      } catch (e) {
        // Storage full or unavailable
      }
    }
    
    flushQueue() {
      try {
        const queue = JSON.parse(localStorage.getItem(ERROR_QUEUE_KEY) || '[]');
        if (queue.length === 0) return;
        
        // Send queued errors
        queue.forEach(error => {
          if (this.sentryLoaded && window.Sentry) {
            window.Sentry.captureException(new Error(error.message), {
              extra: error
            });
          }
        });
        
        // Clear queue
        localStorage.removeItem(ERROR_QUEUE_KEY);
      } catch (e) {
        // Ignore errors
      }
    }
    
    async sendError(error) {
      try {
        await fetch(window.ERROR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(error)
        });
      } catch (e) {
        this.queueError(error);
      }
    }
    
    // Manual error capture
    capture(error, context = {}) {
      this.captureError({
        type: 'manual',
        message: error.message || String(error),
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
      });
    }
    
    // Set user context
    setUser(user) {
      if (this.sentryLoaded && window.Sentry) {
        window.Sentry.setUser({ id: user.id, username: user.username });
      }
    }
    
    // Add breadcrumb for debugging
    addBreadcrumb(message, data = {}) {
      if (this.sentryLoaded && window.Sentry) {
        window.Sentry.addBreadcrumb({
          message,
          data,
          level: 'info'
        });
      }
    }
  }
  
  // Initialize and expose
  window.errorMonitor = new ErrorMonitor();
  
  // Console error wrapper
  const originalConsoleError = console.error;
  console.error = function(...args) {
    // Capture console.error calls
    if (args[0] instanceof Error) {
      window.errorMonitor?.capture(args[0]);
    } else if (typeof args[0] === 'string') {
      window.errorMonitor?.capture(new Error(args.join(' ')));
    }
    originalConsoleError.apply(console, args);
  };
})();
