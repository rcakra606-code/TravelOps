/* =========================================================
   SEASONAL THEME MANAGER - TravelOps
   Applies thematic colors based on current month
   
   Winter:  December - February  (❄️ Blue/Icy)
   Sakura:  March - May          (🌸 Pink)
   Summer:  June - August        (☀️ Blue/Yellow)
   Autumn:  September - November (🍂 Orange/Brown)
   ========================================================= */

(function() {
  'use strict';

  const SEASONS = {
    winter: {
      months: [12, 1, 2],
      name: 'Winter',
      emoji: '❄️',
      class: 'winter'
    },
    sakura: {
      months: [3, 4, 5],
      name: 'Sakura',
      emoji: '🌸',
      class: 'sakura'
    },
    summer: {
      months: [6, 7, 8],
      name: 'Summer',
      emoji: '☀️',
      class: 'summer'
    },
    autumn: {
      months: [9, 10, 11],
      name: 'Autumn',
      emoji: '🍂',
      class: 'autumn'
    }
  };

  function getCurrentSeason() {
    const month = new Date().getMonth() + 1; // 1-12
    
    for (const [key, season] of Object.entries(SEASONS)) {
      if (season.months.includes(month)) {
        return { key, ...season };
      }
    }
    return { key: 'winter', ...SEASONS.winter }; // Default fallback
  }

  function applySeasonalTheme() {
    const season = getCurrentSeason();
    
    // Set data attribute on root element
    document.documentElement.setAttribute('data-season', season.key);
    
    // Store in localStorage for consistency
    localStorage.setItem('currentSeason', season.key);
    
    console.log(`🎨 Seasonal theme applied: ${season.emoji} ${season.name}`);
    
    return season;
  }

  function createSeasonBadge(season) {
    // Check if badge already exists
    if (document.getElementById('seasonBadge')) return;
    
    // Check user preference (can be disabled)
    const showBadge = localStorage.getItem('showSeasonBadge') !== 'false';
    if (!showBadge) return;
    
    const badge = document.createElement('div');
    badge.id = 'seasonBadge';
    badge.className = `season-badge ${season.class}`;
    badge.innerHTML = `${season.emoji} ${season.name}`;
    badge.title = 'Current seasonal theme';
    badge.style.cursor = 'pointer';
    badge.style.pointerEvents = 'auto';
    
    // Click to hide badge
    badge.addEventListener('click', () => {
      badge.style.opacity = '0';
      setTimeout(() => badge.remove(), 300);
      localStorage.setItem('showSeasonBadge', 'false');
    });
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (badge.parentElement) {
        badge.style.opacity = '0';
        setTimeout(() => {
          if (badge.parentElement) badge.remove();
        }, 300);
      }
    }, 5000);
    
    document.body.appendChild(badge);
  }

  // Apply welcome banner seasonal gradient
  function applyWelcomeBannerTheme() {
    const season = getCurrentSeason();
    const gradients = {
      winter: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 50%, #4fc3f7 100%)',
      sakura: 'linear-gradient(135deg, #f06292 0%, #ec407a 50%, #ffb6c1 100%)',
      summer: 'linear-gradient(135deg, #00bcd4 0%, #0097a7 50%, #ffd54f 100%)',
      autumn: 'linear-gradient(135deg, #e65100 0%, #bf360c 50%, #ffab40 100%)'
    };
    
    // Find welcome banners and apply gradient
    const welcomeBanners = document.querySelectorAll('[style*="linear-gradient(135deg, #667eea"]');
    welcomeBanners.forEach(banner => {
      banner.style.background = gradients[season.key];
    });
    
    // Also target report headers
    const reportHeaders = document.querySelectorAll('.report-header');
    reportHeaders.forEach(header => {
      header.style.background = gradients[season.key];
    });
  }

  // Initialize on DOM ready
  function init() {
    const season = applySeasonalTheme();
    createSeasonBadge(season);
    
    // Apply to dynamically styled elements after a short delay
    setTimeout(applyWelcomeBannerTheme, 100);
  }

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for manual control
  window.SeasonalTheme = {
    getCurrentSeason,
    applySeasonalTheme,
    setSeason: (seasonKey) => {
      if (SEASONS[seasonKey]) {
        document.documentElement.setAttribute('data-season', seasonKey);
        localStorage.setItem('currentSeason', seasonKey);
        applyWelcomeBannerTheme();
      }
    },
    showBadge: () => {
      localStorage.setItem('showSeasonBadge', 'true');
      createSeasonBadge(getCurrentSeason());
    }
  };
})();
