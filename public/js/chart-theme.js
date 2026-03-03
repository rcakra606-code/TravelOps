/* Chart.js defaults for sunset dark theme */
(function() {
  function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#8da0be';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
    Chart.defaults.plugins.legend.labels.color = '#8da0be';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(14,27,48,0.95)';
    Chart.defaults.plugins.tooltip.titleColor = '#d4a843';
    Chart.defaults.plugins.tooltip.bodyColor = '#e8ecf2';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(212,168,67,0.20)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    if (Chart.defaults.scales && Chart.defaults.scales.linear) {
      Chart.defaults.scales.linear.grid = Chart.defaults.scales.linear.grid || {};
      Chart.defaults.scales.linear.grid.color = 'rgba(255,255,255,0.06)';
      Chart.defaults.scales.linear.ticks = Chart.defaults.scales.linear.ticks || {};
      Chart.defaults.scales.linear.ticks.color = '#8da0be';
    }
    if (Chart.defaults.scales && Chart.defaults.scales.category) {
      Chart.defaults.scales.category.grid = Chart.defaults.scales.category.grid || {};
      Chart.defaults.scales.category.grid.color = 'rgba(255,255,255,0.06)';
      Chart.defaults.scales.category.ticks = Chart.defaults.scales.category.ticks || {};
      Chart.defaults.scales.category.ticks.color = '#8da0be';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyChartDefaults);
  } else {
    applyChartDefaults();
  }
})();
