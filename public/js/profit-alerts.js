/**
 * Profit Margin Alerts
 * Monitor and alert when profit margins fall below threshold
 */

class ProfitAlerts {
  constructor() {
    this.thresholdKey = 'travelops_profit_threshold';
    this.alertsKey = 'travelops_profit_alerts_dismissed';
    this.defaultThreshold = 15; // 15% default margin threshold
    this.init();
  }

  init() {
    this.addStyles();
    // Check profit margins after data loads
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => this.checkProfitMargins(), 2000);
    });
  }

  getThreshold() {
    return parseFloat(localStorage.getItem(this.thresholdKey)) || this.defaultThreshold;
  }

  setThreshold(value) {
    localStorage.setItem(this.thresholdKey, value.toString());
  }

  getDismissedAlerts() {
    try {
      return JSON.parse(localStorage.getItem(this.alertsKey) || '[]');
    } catch {
      return [];
    }
  }

  dismissAlert(id) {
    const dismissed = this.getDismissedAlerts();
    dismissed.push(id);
    // Keep only last 100 dismissals
    localStorage.setItem(this.alertsKey, JSON.stringify(dismissed.slice(-100)));
  }

  async checkProfitMargins() {
    // Only run on sales/tours dashboards or main dashboard
    const path = window.location.pathname;
    if (!path.includes('sales') && !path.includes('tours') && !path.includes('single-dashboard')) {
      return;
    }

    try {
      const threshold = this.getThreshold();
      const dismissed = this.getDismissedAlerts();
      const alerts = [];

      // Check tours data if available
      if (window.toursData || window.fetchJson) {
        const tours = window.toursData || await window.fetchJson?.('/api/tours');
        if (tours && Array.isArray(tours)) {
          tours.forEach(tour => {
            if (tour.sales_amount && tour.profit_amount) {
              const margin = (tour.profit_amount / tour.sales_amount) * 100;
              const alertId = `tour_${tour.id}_margin`;
              
              if (margin < threshold && !dismissed.includes(alertId)) {
                alerts.push({
                  id: alertId,
                  type: 'warning',
                  title: `Low Profit Margin: ${tour.tour_code || 'Tour #' + tour.id}`,
                  message: `Profit margin is ${margin.toFixed(1)}% (below ${threshold}% threshold)`,
                  details: {
                    sales: tour.sales_amount,
                    profit: tour.profit_amount,
                    margin: margin.toFixed(1)
                  }
                });
              }
            }
          });
        }
      }

      // Check sales data if available
      if (window.salesData || window.fetchJson) {
        const sales = window.salesData || await window.fetchJson?.('/api/sales');
        if (sales && Array.isArray(sales)) {
          // Aggregate by month
          const byMonth = {};
          sales.forEach(s => {
            const month = s.month || 'Unknown';
            if (!byMonth[month]) byMonth[month] = { sales: 0, profit: 0 };
            byMonth[month].sales += parseFloat(s.sales_amount) || 0;
            byMonth[month].profit += parseFloat(s.profit_amount) || 0;
          });

          Object.entries(byMonth).forEach(([month, data]) => {
            if (data.sales > 0) {
              const margin = (data.profit / data.sales) * 100;
              const alertId = `sales_${month}_margin`;
              
              if (margin < threshold && !dismissed.includes(alertId)) {
                alerts.push({
                  id: alertId,
                  type: margin < threshold / 2 ? 'danger' : 'warning',
                  title: `Low Monthly Margin: ${month}`,
                  message: `Average profit margin is ${margin.toFixed(1)}%`,
                  details: {
                    sales: data.sales,
                    profit: data.profit,
                    margin: margin.toFixed(1)
                  }
                });
              }
            }
          });
        }
      }

      // Show alerts
      if (alerts.length > 0) {
        this.showAlerts(alerts.slice(0, 3)); // Show max 3 alerts
      }
    } catch (err) {
      console.error('Failed to check profit margins:', err);
    }
  }

  showAlerts(alerts) {
    // Remove existing alert container
    document.getElementById('profitAlertsContainer')?.remove();

    const container = document.createElement('div');
    container.id = 'profitAlertsContainer';
    container.className = 'profit-alerts-container';
    container.innerHTML = alerts.map(alert => `
      <div class="profit-alert profit-alert-${alert.type}" data-alert-id="${alert.id}">
        <div class="profit-alert-icon">${alert.type === 'danger' ? '🚨' : '⚠️'}</div>
        <div class="profit-alert-content">
          <div class="profit-alert-title">${alert.title}</div>
          <div class="profit-alert-message">${alert.message}</div>
        </div>
        <button class="profit-alert-dismiss" data-dismiss="${alert.id}" title="Dismiss">&times;</button>
      </div>
    `).join('');

    document.body.appendChild(container);

    // Bind dismiss events
    container.querySelectorAll('.profit-alert-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        const alertId = btn.dataset.dismiss;
        this.dismissAlert(alertId);
        btn.closest('.profit-alert')?.remove();
        
        // Remove container if empty
        if (container.children.length === 0) {
          container.remove();
        }
      });
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      container.remove();
    }, 30000);
  }

  showSettingsModal() {
    const currentThreshold = this.getThreshold();
    
    window.openModal?.({
      title: '📊 Profit Alert Settings',
      bodyHtml: `
        <div style="padding: 20px;">
          <div class="form-group">
            <label style="font-weight: 600; margin-bottom: 8px; display: block;">
              Profit Margin Threshold (%)
            </label>
            <input type="number" id="profitThresholdInput" value="${currentThreshold}" 
                   min="1" max="50" step="1"
                   style="width: 100%; padding: 12px; border: 1px solid var(--border-light); border-radius: 8px;">
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">
              You'll be alerted when profit margin falls below this percentage.
            </p>
          </div>
        </div>
      `,
      onSubmit: () => {
        const input = document.getElementById('profitThresholdInput');
        if (input) {
          const value = parseFloat(input.value) || this.defaultThreshold;
          this.setThreshold(Math.max(1, Math.min(50, value)));
          window.toast?.success('Profit threshold updated');
        }
      }
    });
  }

  addStyles() {
    if (document.getElementById('profitAlertsStyles')) return;

    const style = document.createElement('style');
    style.id = 'profitAlertsStyles';
    style.textContent = `
      .profit-alerts-container {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9000;
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-width: 400px;
      }

      .profit-alert {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease;
      }

      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .profit-alert-warning {
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        border: 1px solid #f59e0b;
      }

      .profit-alert-danger {
        background: linear-gradient(135deg, #fee2e2, #fecaca);
        border: 1px solid #ef4444;
      }

      .profit-alert-icon {
        font-size: 24px;
        flex-shrink: 0;
      }

      .profit-alert-content {
        flex: 1;
      }

      .profit-alert-title {
        font-weight: 700;
        font-size: 14px;
        color: #1f2937;
        margin-bottom: 4px;
      }

      .profit-alert-message {
        font-size: 13px;
        color: #4b5563;
      }

      .profit-alert-dismiss {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(0,0,0,0.1);
        border-radius: 6px;
        font-size: 18px;
        cursor: pointer;
        color: #6b7280;
        transition: all 0.2s;
        flex-shrink: 0;
      }

      .profit-alert-dismiss:hover {
        background: rgba(0,0,0,0.2);
        color: #1f2937;
      }

      @media (max-width: 600px) {
        .profit-alerts-container {
          left: 16px;
          right: 16px;
          max-width: none;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize
window.profitAlerts = new ProfitAlerts();
