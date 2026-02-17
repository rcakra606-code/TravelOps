/**
 * API Response Caching Module
 * Caches API responses to reduce server load and improve performance
 */

(function() {
  'use strict';

  const CACHE_PREFIX = 'api-cache-';
  const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  const MAX_CACHE_SIZE = 100;

  // Cache configuration by endpoint pattern
  const cacheConfig = {
    // Long TTL for rarely changing data
    '/api/regions': { ttl: 60 * 60 * 1000 }, // 1 hour
    '/api/users': { ttl: 30 * 60 * 1000 }, // 30 minutes
    '/api/settings': { ttl: 60 * 60 * 1000 }, // 1 hour
    
    // Medium TTL for moderately changing data
    '/api/targets': { ttl: 15 * 60 * 1000 }, // 15 minutes
    '/api/productivity': { ttl: 10 * 60 * 1000 }, // 10 minutes
    
    // Short TTL for frequently changing data
    '/api/sales': { ttl: 2 * 60 * 1000 }, // 2 minutes
    '/api/tours': { ttl: 2 * 60 * 1000 }, // 2 minutes
    '/api/dashboard': { ttl: 1 * 60 * 1000 }, // 1 minute
    
    // No cache for sensitive or real-time data
    '/api/login': { noCache: true },
    '/api/logout': { noCache: true },
    '/api/activity_logs': { noCache: true }
  };

  class APICache {
    constructor() {
      this.memoryCache = new Map();
      this.init();
    }
    
    init() {
      // Clean up expired entries on load
      this.cleanup();
      
      // Periodic cleanup every 5 minutes
      setInterval(() => this.cleanup(), 5 * 60 * 1000);
      
      // Clear cache on logout
      window.addEventListener('storage', (e) => {
        if (e.key === 'token' && !e.newValue) {
          this.clearAll();
        }
      });
    }
    
    getCacheKey(url, options = {}) {
      // Create unique key based on URL and relevant options
      const params = new URL(url, window.location.origin).searchParams.toString();
      const method = options.method || 'GET';
      return `${CACHE_PREFIX}${method}:${url}${params ? '?' + params : ''}`;
    }
    
    getConfig(url) {
      // Find matching cache configuration
      for (const [pattern, config] of Object.entries(cacheConfig)) {
        if (url.includes(pattern)) {
          return config;
        }
      }
      return { ttl: DEFAULT_TTL };
    }
    
    async get(url) {
      const key = this.getCacheKey(url);
      
      // Try memory cache first
      const memEntry = this.memoryCache.get(key);
      if (memEntry && memEntry.expires > Date.now()) {
        return memEntry.data;
      }
      
      // Try localStorage
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const entry = JSON.parse(stored);
          if (entry.expires > Date.now()) {
            // Restore to memory cache
            this.memoryCache.set(key, entry);
            return entry.data;
          } else {
            // Expired, remove it
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        // Storage error, ignore
      }
      
      return null;
    }
    
    set(url, data, ttl = null) {
      const config = this.getConfig(url);
      if (config.noCache) return;
      
      const key = this.getCacheKey(url);
      const expires = Date.now() + (ttl || config.ttl || DEFAULT_TTL);
      const entry = { data, expires, url };
      
      // Store in memory
      this.memoryCache.set(key, entry);
      
      // Store in localStorage
      try {
        localStorage.setItem(key, JSON.stringify(entry));
      } catch (e) {
        // Storage full, cleanup and retry
        this.cleanup(true);
        try {
          localStorage.setItem(key, JSON.stringify(entry));
        } catch (e2) {
          // Still full, skip localStorage
        }
      }
      
      // Limit memory cache size
      if (this.memoryCache.size > MAX_CACHE_SIZE) {
        const oldestKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(oldestKey);
      }
    }
    
    invalidate(urlPattern) {
      // Invalidate all entries matching pattern
      const pattern = typeof urlPattern === 'string' ? urlPattern : urlPattern.toString();
      
      // Memory cache
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.url.includes(pattern)) {
          this.memoryCache.delete(key);
        }
      }
      
      // LocalStorage
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(CACHE_PREFIX)) {
            const entry = JSON.parse(localStorage.getItem(key) || '{}');
            if (entry.url?.includes(pattern)) {
              localStorage.removeItem(key);
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    clearAll() {
      // Clear memory cache
      this.memoryCache.clear();
      
      // Clear localStorage
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(CACHE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    cleanup(aggressive = false) {
      const now = Date.now();
      
      // Memory cache
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expires < now) {
          this.memoryCache.delete(key);
        }
      }
      
      // LocalStorage
      try {
        let count = 0;
        const toRemove = [];
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(CACHE_PREFIX)) {
            count++;
            try {
              const entry = JSON.parse(localStorage.getItem(key) || '{}');
              if (entry.expires < now || (aggressive && count > MAX_CACHE_SIZE / 2)) {
                toRemove.push(key);
              }
            } catch (e) {
              toRemove.push(key);
            }
          }
        }
        
        toRemove.forEach(key => localStorage.removeItem(key));
      } catch (e) {
        // Ignore errors
      }
    }
  }

  // Create global instance
  const apiCache = new APICache();

  // Wrap fetch to add caching
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    // Only cache GET requests
    const method = options.method?.toUpperCase() || 'GET';
    if (method !== 'GET') {
      // Invalidate cache on mutations
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const urlObj = new URL(url, window.location.origin);
        apiCache.invalidate(urlObj.pathname);
      }
      return originalFetch(url, options);
    }
    
    // Skip caching for non-API requests
    if (!url.includes('/api/')) {
      return originalFetch(url, options);
    }
    
    // Check if caching is disabled for this endpoint
    const config = apiCache.getConfig(url);
    if (config.noCache) {
      return originalFetch(url, options);
    }
    
    // Check cache
    const cached = await apiCache.get(url);
    if (cached) {
      // Return cached response
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' }
      });
    }
    
    // Fetch from network
    const response = await originalFetch(url, options);
    
    // Only cache successful responses
    if (response.ok) {
      const clone = response.clone();
      try {
        const data = await clone.json();
        apiCache.set(url, data);
      } catch (e) {
        // Not JSON, skip caching
      }
    }
    
    return response;
  };

  // Expose for manual cache management
  window.apiCache = {
    get: (url) => apiCache.get(url),
    set: (url, data, ttl) => apiCache.set(url, data, ttl),
    invalidate: (pattern) => apiCache.invalidate(pattern),
    clear: () => apiCache.clearAll(),
    cleanup: () => apiCache.cleanup()
  };

  // Invalidate cache when user performs actions
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-invalidate-cache]');
    if (btn) {
      const pattern = btn.dataset.invalidateCache;
      apiCache.invalidate(pattern);
    }
  });
})();
