/**
 * Image Lazy Loading Module
 * Automatically applies lazy loading to images for better performance
 */

(function() {
  'use strict';

  class LazyLoader {
    constructor() {
      this.observer = null;
      this.defaultPlaceholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f1f5f9" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="system-ui" font-size="14"%3ELoading...%3C/text%3E%3C/svg%3E';
      this.init();
    }
    
    init() {
      // Check for native lazy loading support
      if ('loading' in HTMLImageElement.prototype) {
        this.useNativeLazyLoad();
      } else {
        this.useIntersectionObserver();
      }
      
      // Watch for dynamically added images
      this.observeDOM();
    }
    
    useNativeLazyLoad() {
      // Add loading="lazy" to all images that don't have it
      document.querySelectorAll('img:not([loading])').forEach(img => {
        img.setAttribute('loading', 'lazy');
        this.addPlaceholder(img);
      });
    }
    
    useIntersectionObserver() {
      if (!('IntersectionObserver' in window)) {
        // Fallback: load all images immediately
        return;
      }
      
      this.observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            this.loadImage(img);
            observer.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px 0px', // Start loading 50px before entering viewport
        threshold: 0.01
      });
      
      // Observe all images
      document.querySelectorAll('img[data-src]').forEach(img => {
        this.observer.observe(img);
      });
    }
    
    loadImage(img) {
      const src = img.dataset.src || img.src;
      if (!src) return;
      
      // Add loading class
      img.classList.add('lazy-loading');
      
      // Create new image to preload
      const tempImg = new Image();
      tempImg.onload = () => {
        img.src = src;
        img.classList.remove('lazy-loading');
        img.classList.add('lazy-loaded');
        img.removeAttribute('data-src');
      };
      tempImg.onerror = () => {
        img.classList.remove('lazy-loading');
        img.classList.add('lazy-error');
        img.alt = img.alt || 'Image failed to load';
      };
      tempImg.src = src;
    }
    
    addPlaceholder(img) {
      // Skip if image already loaded or has data-src
      if (img.complete || img.dataset.src) return;
      
      // Store original src
      const originalSrc = img.src;
      if (!originalSrc || originalSrc.startsWith('data:')) return;
      
      // Set placeholder
      img.dataset.src = originalSrc;
      img.src = img.dataset.placeholder || this.defaultPlaceholder;
      
      // Add to observer if using IntersectionObserver
      if (this.observer) {
        this.observer.observe(img);
      }
    }
    
    observeDOM() {
      // Watch for new images added to the DOM
      const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Element node
              if (node.tagName === 'IMG') {
                this.processImage(node);
              }
              // Check children
              node.querySelectorAll?.('img')?.forEach(img => {
                this.processImage(img);
              });
            }
          });
        });
      });
      
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    processImage(img) {
      // Skip already processed images
      if (img.dataset.lazyProcessed) return;
      img.dataset.lazyProcessed = 'true';
      
      // Add native lazy loading
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
      
      // Add decoding async for better performance
      if (!img.hasAttribute('decoding')) {
        img.setAttribute('decoding', 'async');
      }
    }
  }

  // Add CSS for lazy loading states
  const style = document.createElement('style');
  style.textContent = `
    img.lazy-loading {
      opacity: 0.5;
      filter: blur(5px);
      transition: opacity 0.3s ease, filter 0.3s ease;
    }
    
    img.lazy-loaded {
      opacity: 1;
      filter: blur(0);
    }
    
    img.lazy-error {
      position: relative;
      min-height: 100px;
      background: #f8fafc;
    }
    
    img.lazy-error::after {
      content: '⚠️ ' attr(alt);
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      font-size: 0.875rem;
      padding: 8px;
      text-align: center;
    }
    
    /* Placeholder skeleton */
    img[data-src]:not(.lazy-loaded) {
      background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
      background-size: 200% 100%;
      animation: imgSkeleton 1.5s ease-in-out infinite;
    }
    
    @keyframes imgSkeleton {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(style);

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new LazyLoader());
  } else {
    new LazyLoader();
  }
  
  // Expose for manual use
  window.LazyLoader = LazyLoader;
})();
