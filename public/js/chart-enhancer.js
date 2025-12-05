/**
 * Chart Enhancement Utilities
 * Adds mini charts (sparklines) to metric cards
 */

class ChartEnhancer {
  constructor() {
    this.charts = new Map();
  }

  /**
   * Create a mini sparkline chart
   */
  createSparkline(canvasId, data, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const config = {
      type: 'line',
      data: {
        labels: data.labels || data.map((_, i) => i),
        datasets: [{
          data: data.values || data,
          borderColor: options.color || '#3b82f6',
          backgroundColor: options.fillColor || 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: options.color || '#3b82f6'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            displayColors: false,
            callbacks: {
              label: (context) => {
                return options.formatter 
                  ? options.formatter(context.parsed.y)
                  : context.parsed.y.toLocaleString();
              }
            }
          }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    };

    const chart = new Chart(canvas, config);
    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Add sparkline to metric card
   */
  addSparklineToCard(cardSelector, data, options = {}) {
    const card = document.querySelector(cardSelector);
    if (!card) return;

    // Create canvas element
    const canvasId = `sparkline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.style.height = options.height || '60px';
    canvas.style.marginTop = '12px';
    
    // Insert canvas
    const valueEl = card.querySelector('.metric-value');
    if (valueEl) {
      valueEl.after(canvas);
    } else {
      card.appendChild(canvas);
    }

    // Create chart
    return this.createSparkline(canvasId, data, options);
  }

  /**
   * Create donut progress chart
   */
  createProgressDonut(canvasId, percentage, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const config = {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [percentage, 100 - percentage],
          backgroundColor: [
            options.color || '#3b82f6',
            options.bgColor || '#e5e7eb'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    };

    const chart = new Chart(canvas, config);
    
    // Add percentage text in center
    const ctx = canvas.getContext('2d');
    const centerText = `${percentage}%`;
    
    Chart.register({
      id: 'centerText',
      afterDraw(chart) {
        const { width, height, ctx } = chart;
        ctx.restore();
        const fontSize = (height / 114).toFixed(2);
        ctx.font = `bold ${fontSize}em sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = options.textColor || '#111827';
        const text = centerText;
        const textX = Math.round((width - ctx.measureText(text).width) / 2);
        const textY = height / 2;
        ctx.fillText(text, textX, textY);
        ctx.save();
      }
    });

    this.charts.set(canvasId, chart);
    return chart;
  }

  /**
   * Destroy chart
   */
  destroyChart(canvasId) {
    const chart = this.charts.get(canvasId);
    if (chart) {
      chart.destroy();
      this.charts.delete(canvasId);
    }
  }

  /**
   * Destroy all charts
   */
  destroyAll() {
    this.charts.forEach(chart => chart.destroy());
    this.charts.clear();
  }
}

// Global instance
const chartEnhancer = new ChartEnhancer();

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.ChartEnhancer = ChartEnhancer;
  window.chartEnhancer = chartEnhancer;
}
