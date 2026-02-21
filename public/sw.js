// TravelOps Service Worker - Enhanced PWA v9
const CACHE_NAME = 'travelops-v9';
const STATIC_ASSETS = [
  '/',
  '/single-dashboard.html',
  '/login.html',
  '/sales-targets-dashboard.html',
  '/tours-dashboard.html',
  '/my-tours.html',
  '/documents-dashboard.html',
  '/tracking-dashboard.html',
  '/reports-dashboard.html',
  '/sales-targets-dashboard.html',
  '/telecom-dashboard.html',
  '/hotel-dashboard.html',
  '/overtime-dashboard.html',
  '/cruise-dashboard.html',
  '/outstanding-dashboard.html',
  '/css/styles.css',
  '/css/dark-mode.css',
  '/css/app-v2.css',
  '/css/dashboard.css',
  '/css/modal.css',
  '/css/filters.css',
  '/css/mobile-responsive.css',
  '/css/table-enhancements.css',
  '/css/filter-enhancements.css',
  '/css/status-badges.css',
  '/css/animations.css',
  '/css/crud-enhancements.css',
  '/css/ui-enhancements.css',
  '/css/professional-polish.css',
  '/css/micro-interactions.css',
  '/css/accessibility.css',
  '/js/auth-common.js',
  '/js/dashboard.js',
  '/js/toast.js',
  '/js/theme-toggle.js',
  '/js/tracking-dashboard.js',
  '/js/global-search.js',
  '/js/tour-calendar.js',
  '/js/staff-leaderboard.js',
  '/js/yoy-analytics.js',
  '/js/bulk-importer.js',
  '/js/dashboard-widgets.js',
  '/js/audit-trail.js',
  '/js/i18n.js',
  '/js/data-exporter.js',
  '/js/saved-filters.js',
  '/js/pwa-install.js',
  '/js/keyboard-help.js',
  '/js/pdf-export.js',
  '/js/customer-database.js',
  '/js/batch-status.js',
  '/js/commission-calculator.js',
  '/js/activity-feed.js',
  '/js/advanced-reporting.js',
  '/js/staff-management.js',
  '/js/dashboard-analytics.js',
  '/js/error-monitoring.js',
  '/js/api-cache.js',
  '/js/breadcrumb-nav.js',
  '/js/lazy-loader.js',
  '/js/security-utils.js',
  '/js/ui-extras.js',
  '/manifest.json'
];

// Offline data queue for sync
const OFFLINE_QUEUE_KEY = 'offline-queue';

// Install - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip non-http(s) URLs (chrome-extension://, etc)
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip API calls - always go to network
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // Skip external resources that may have CORS/CSP issues
  const origin = self.location.origin;
  if (!event.request.url.startsWith(origin) && 
      !event.request.url.includes('cdn.jsdelivr.net') && 
      !event.request.url.includes('cdnjs.cloudflare.com')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return offline page for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/single-dashboard.html');
          }
        });
      })
  );
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title || 'TravelOps', {
      body: data.body || 'You have a new notification',
      icon: '/images/icon-192.png',
      badge: '/images/icon-192.png'
    });
  }
});
