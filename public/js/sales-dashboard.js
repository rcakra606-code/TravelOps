/* =========================================================
   SALES DASHBOARD SCRIPT
   Focused analytics for sales performance and targets
   ========================================================= */

/* === GLOBAL HELPERS (auth-common.js provides shared auth) === */
const el = id => document.getElementById(id);

/* === DISPLAY USER INFO === */
(() => {
  const user = window.getUser();
  el('userName').textContent = user.name || user.username || '—';
  el('userRole').textContent = { admin: 'Administrator', semiadmin: 'Semi Admin', basic: 'Staff' }[user.type] || user.type || '—';
})();

/* === CHARTS STORAGE === */
let charts = {};

/* === FILTER STATE === */
let filterState = {
  staff: 'all',
  month: '', // YYYY-MM format
  useCustomRange: false,
  dateFrom: '',
  dateTo: ''
};

let regionsData = [];
let usersData = [];

/* === FILTER MANAGEMENT === */
function openSalesFilterModal() {
  const user = window.getUser();
  const isAdmin = user.type === 'admin';
  
  // Generate month options for quick select
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
  
  // Only show staff filter for admin users
  const staffDropdown = isAdmin ? `
    <div class="filter-group">
      <label><span class="icon">👤</span> Staff</label>
      <select name="staff">
        <option value="all">All Staff</option>
        ${usersData.map(u => `<option value="${u.name}" ${filterState.staff === u.name ? 'selected' : ''}>${u.name}</option>`).join('')}
      </select>
    </div>
  ` : '';
  
  window.openModal({
    title: '🔍 Filter Sales Data',
    size: 'medium',
    bodyHtml: `
      <div class="filter-modal-content">
        <!-- Quick Filters -->
        <div class="quick-filters">
          <button type="button" class="quick-filter-chip ${filterState.month === currentMonth ? 'active' : ''}" data-quick-month="${currentMonth}">
            📅 This Month
          </button>
          <button type="button" class="quick-filter-chip ${filterState.month === lastMonthStr ? 'active' : ''}" data-quick-month="${lastMonthStr}">
            📆 Last Month
          </button>
          <button type="button" class="quick-filter-chip ${filterState.useCustomRange ? '' : (!filterState.month ? 'active' : '')}" data-quick-month="">
            📊 All Time
          </button>
          <button type="button" class="quick-filter-chip ${filterState.useCustomRange ? 'active' : ''}" data-custom-range>
            📅 Custom Range
          </button>
        </div>
        
        <div class="filter-section">
          <div class="filter-section-title">Filter Options</div>
          <div class="filter-grid">
            ${staffDropdown}
            <div class="filter-group">
              <label><span class="icon">📅</span> Select Month</label>
              <input type="month" name="month" value="${filterState.month || ''}" id="monthFilter">
            </div>
          </div>
        </div>
        
        <!-- Custom Date Range Section -->
        <div class="filter-section" id="customDateRange" style="display: ${filterState.useCustomRange ? 'block' : 'none'};">
          <div class="filter-section-title">📅 Custom Date Range</div>
          <div class="filter-grid">
            <div class="filter-group">
              <label><span class="icon">📆</span> From Date</label>
              <input type="date" name="dateFrom" value="${filterState.dateFrom || ''}">
            </div>
            <div class="filter-group">
              <label><span class="icon">📆</span> To Date</label>
              <input type="date" name="dateTo" value="${filterState.dateTo || ''}">
            </div>
          </div>
        </div>
        
        <input type="hidden" name="useCustomRange" value="${filterState.useCustomRange ? '1' : ''}">
        
        <div class="filter-footer">
          <div class="filter-footer-left">
            <button type="button" class="btn-reset-filter" data-reset-sales-filters>
              🔄 Reset Filters
            </button>
          </div>
          <div class="filter-footer-right">
            <button type="submit" class="btn-apply-filter">
              ✓ Apply Filters
            </button>
          </div>
        </div>
      </div>
    `,
    context: { entity: 'sales', action: 'filter' }
  });
  
  // Setup quick filter clicks
  setTimeout(() => {
    document.querySelectorAll('[data-quick-month]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const monthVal = btn.dataset.quickMonth;
        const monthInput = document.querySelector('input[name="month"]');
        const customRangeSection = document.getElementById('customDateRange');
        const useCustomRangeInput = document.querySelector('input[name="useCustomRange"]');
        
        if (monthInput) monthInput.value = monthVal;
        if (customRangeSection) customRangeSection.style.display = 'none';
        if (useCustomRangeInput) useCustomRangeInput.value = '';
        
        // Update active state
        document.querySelectorAll('[data-quick-month], [data-custom-range]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Custom range toggle
    const customRangeBtn = document.querySelector('[data-custom-range]');
    if (customRangeBtn) {
      customRangeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const customRangeSection = document.getElementById('customDateRange');
        const monthInput = document.querySelector('input[name="month"]');
        const useCustomRangeInput = document.querySelector('input[name="useCustomRange"]');
        
        if (customRangeSection) customRangeSection.style.display = 'block';
        if (monthInput) monthInput.value = '';
        if (useCustomRangeInput) useCustomRangeInput.value = '1';
        
        // Update active state
        document.querySelectorAll('[data-quick-month], [data-custom-range]').forEach(b => b.classList.remove('active'));
        customRangeBtn.classList.add('active');
      });
    }
  }, 100);
}

function resetSalesFilters() {
  filterState = {
    staff: 'all',
    month: '',
    useCustomRange: false,
    dateFrom: '',
    dateTo: ''
  };
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

function applySalesFilters(formData) {
  console.log('Applying filters with data:', formData);
  filterState.staff = formData.staff || 'all';
  filterState.month = formData.month || '';
  filterState.useCustomRange = formData.useCustomRange === '1';
  filterState.dateFrom = formData.dateFrom || '';
  filterState.dateTo = formData.dateTo || '';
  
  console.log('Updated filterState:', filterState);
  if (window.closeModal) window.closeModal();
  renderDashboard();
}

async function populateFilterDropdowns() {
  const user = window.getUser();
  
  // Load users independently
  try {
    const users = await window.fetchJson('/api/users');
    usersData = users || [];
  } catch (err) {
    console.error('Error loading users:', err);
    if (user.type === 'basic') {
      usersData = [{ name: user.name || user.username }];
    } else {
      usersData = [];
    }
  }
  
  // Load regions independently
  try {
    const regions = await window.fetchJson('/api/regions');
    regionsData = regions || [];
  } catch (err) {
    console.error('Error loading regions:', err);
    regionsData = [];
  }
}

/* === RENDER DASHBOARD === */
async function renderDashboard() {
  try {
    const user = window.getUser();
    
    // Default to current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    let staff = '';
    
    // For admin, use filter; for staff/semi-admin, auto-filter to their own data
    if (user.type === 'admin') {
      staff = filterState.staff !== 'all' ? filterState.staff : '';
    } else {
      staff = user.name || user.username;
    }
    
    // Determine which month/year to use for achievement metrics
    // If filter is applied, use filtered month; otherwise use current month
    let metricsMonth, metricsYear;
    if (filterState.month) {
      const [y, m] = filterState.month.split('-');
      metricsMonth = m;
      metricsYear = y;
    } else {
      metricsMonth = String(now.getMonth() + 1).padStart(2, '0');
      metricsYear = String(now.getFullYear());
    }
    
    // Build parameters for achievement (filtered month or current month)
    const achievementParams = {
      month: metricsMonth,
      year: metricsYear
    };
    if (staff) achievementParams.staff = staff;
    
    // Build parameters for trend data (all historical data for the user/staff)
    const trendParams = {};
    if (staff) trendParams.staff = staff;
    // Don't filter by month/year for trends - show all history
    
    // Build parameters for top staff (current month or filtered month)
    const topStaffParams = {};
    if (filterState.month) {
      const [y, m] = filterState.month.split('-');
      topStaffParams.month = m;
      topStaffParams.year = y;
    } else {
      // Default to current month
      topStaffParams.month = String(now.getMonth() + 1).padStart(2, '0');
      topStaffParams.year = String(now.getFullYear());
    }
    
    console.log('Achievement params (current month):', achievementParams);
    console.log('Trend params (all history):', trendParams);
    console.log('Top staff params:', topStaffParams);
    
    const achievementQ = new URLSearchParams(achievementParams).toString();
    const trendQ = new URLSearchParams(trendParams).toString();
    const topStaffQ = new URLSearchParams(topStaffParams).toString();
    
    // Fetch data - also get targets for trend charts (staff filter uses 'staff' param like sales)
    const [achievementMetrics, trendData, topStaffData, targetsData] = await Promise.all([
      window.fetchJson('/api/metrics?' + achievementQ),
      window.fetchJson('/api/sales?' + trendQ),
      window.fetchJson('/api/sales?' + topStaffQ),
      window.fetchJson('/api/targets' + (staff ? '?' + new URLSearchParams({ staff }).toString() : '')).catch(err => {
        console.warn('Failed to fetch targets:', err);
        return [];
      })
    ]);
    
    console.log('Achievement metrics:', achievementMetrics);
    console.log('Trend data count:', trendData?.length || 0);
    console.log('Trend data sample:', trendData?.slice(0, 2));
    console.log('Top staff data count:', topStaffData?.length || 0);
    console.log('Targets data:', targetsData);
    
    if (!trendData || trendData.length === 0) {
      console.warn('⚠️ No sales data found! The database might be empty.');
      window.toast?.warning('No sales data found. Please add sales records first.');
    }
    
    // Destroy existing charts
    Object.keys(charts).forEach(key => {
      if (charts[key] && typeof charts[key].destroy === 'function') {
        try {
          charts[key].destroy();
        } catch (e) {
          console.warn('Error destroying chart:', key, e);
        }
      }
      delete charts[key];
    });
    
    // Clear Chart.js instances
    const canvasIds = ['chartSalesTarget', 'chartProfitTarget', 'chartSalesVsTarget', 'chartProfitVsTarget', 'chartSalesTrend', 'chartProfitTrend', 'chartTopStaff'];
    canvasIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
          existingChart.destroy();
        }
      }
    });
    
    // Calculate current month metrics with proper null checks
    const totalSales = achievementMetrics?.sales?.total_sales || 0;
    const totalProfit = achievementMetrics?.sales?.total_profit || 0;
    const targetSales = achievementMetrics?.targets?.target_sales || 0;
    const targetProfit = achievementMetrics?.targets?.target_profit || 0;
    const profitMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : 0;
    
    // Update active filter badge
    const filterBadge = el('activeFilterBadge');
    if (filterBadge) {
      if (filterState.month || (filterState.staff && filterState.staff !== 'all')) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let filterText = [];
        if (filterState.month) {
          const [y, m] = filterState.month.split('-');
          filterText.push(`📅 ${monthNames[parseInt(m) - 1]} ${y}`);
        }
        if (filterState.staff && filterState.staff !== 'all') {
          filterText.push(`👤 ${filterState.staff}`);
        }
        filterBadge.textContent = filterText.join(' • ');
        filterBadge.style.display = 'inline-block';
      } else {
        filterBadge.style.display = 'none';
      }
    }
    
    // Update metrics display
    if (el('totalSales')) el('totalSales').textContent = window.formatCurrency(totalSales);
    if (el('totalProfit')) el('totalProfit').textContent = window.formatCurrency(totalProfit);
    if (el('profitMargin')) el('profitMargin').textContent = profitMargin + '%';
    if (el('totalTransactions')) el('totalTransactions').textContent = trendData?.length || 0;
    if (el('salesAchievement')) el('salesAchievement').textContent = `Target: ${targetSales > 0 ? (totalSales / targetSales * 100).toFixed(1) : 0}%`;
    if (el('profitAchievement')) el('profitAchievement').textContent = `Target: ${targetProfit > 0 ? (totalProfit / targetProfit * 100).toFixed(1) : 0}%`;
    
    // Chart options
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          padding: 12,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(context.parsed.y);
              }
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: value => 'Rp ' + value.toLocaleString('id-ID')
          }
        }
      }
    };
    
    // Store trendData globally for drill-down access
    window._salesTrendData = trendData;
    
    // Format month label for charts
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const displayMonthLabel = filterState.month 
      ? `${monthNames[parseInt(metricsMonth) - 1]} ${metricsYear}`
      : 'Current Month';
    
    // 1. Sales Achievement Chart (Selected Month vs Target)
    const ctxSalesTarget = document.getElementById('chartSalesTarget')?.getContext('2d');
    if (ctxSalesTarget) {
      charts.salesTarget = new Chart(ctxSalesTarget, {
        type: 'bar',
        data: {
          labels: [displayMonthLabel, 'Target'],
          datasets: [{
            label: 'Sales (Rp)',
            data: [totalSales, targetSales],
            backgroundColor: ['#10b981', '#d1d5db'],
            borderRadius: 8
          }]
        },
        options: commonOptions
      });
    }
    
    // 2. Profit Achievement Chart (Selected Month vs Target)
    const ctxProfitTarget = document.getElementById('chartProfitTarget')?.getContext('2d');
    if (ctxProfitTarget) {
      charts.profitTarget = new Chart(ctxProfitTarget, {
        type: 'bar',
        data: {
          labels: [displayMonthLabel, 'Target'],
          datasets: [{
            label: 'Profit (Rp)',
            data: [totalProfit, targetProfit],
            backgroundColor: ['#3b82f6', '#d1d5db'],
            borderRadius: 8
          }]
        },
        options: commonOptions
      });
    }
    
    // 3. Sales vs Target (Month-to-Month Bar Comparison)
    if (trendData && trendData.length > 0) {
      const monthlySales = {};
      const monthlyTargets = {};
      
      // Aggregate sales by month
      trendData.forEach(sale => {
        let month = null;
        if (sale.transaction_date) {
          month = sale.transaction_date.substring(0, 7);
        } else if (sale.month) {
          month = sale.month;
        }
        if (month) {
          monthlySales[month] = (monthlySales[month] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      // Aggregate targets by month
      if (targetsData && Array.isArray(targetsData) && targetsData.length > 0) {
        targetsData.forEach(target => {
          if (target.month && target.year) {
            const monthStr = `${target.year}-${String(target.month).padStart(2, '0')}`;
            monthlyTargets[monthStr] = (monthlyTargets[monthStr] || 0) + (parseFloat(target.target_sales) || 0);
          }
        });
      }
      
      const sortedMonths = Object.keys(monthlySales).sort();
      if (sortedMonths.length > 0) {
        const ctxSalesVsTarget = document.getElementById('chartSalesVsTarget')?.getContext('2d');
        if (ctxSalesVsTarget) {
          charts.salesVsTarget = new Chart(ctxSalesVsTarget, {
            type: 'bar',
            data: {
              labels: sortedMonths,
              datasets: [
                {
                  label: 'Actual Sales (Rp)',
                  data: sortedMonths.map(m => monthlySales[m]),
                  backgroundColor: '#10b981',
                  borderRadius: 6
                },
                {
                  label: 'Target Sales (Rp)',
                  data: sortedMonths.map(m => monthlyTargets[m] || 0),
                  backgroundColor: '#f59e0b',
                  borderRadius: 6
                }
              ]
            },
            options: commonOptions
          });
        }
      }
    }
    
    // 4. Profit vs Target (Month-to-Month Bar Comparison)
    if (trendData && trendData.length > 0) {
      const monthlyProfit = {};
      const monthlyProfitTargets = {};
      
      // Aggregate profit by month
      trendData.forEach(sale => {
        let month = null;
        if (sale.transaction_date) {
          month = sale.transaction_date.substring(0, 7);
        } else if (sale.month) {
          month = sale.month;
        }
        if (month) {
          monthlyProfit[month] = (monthlyProfit[month] || 0) + (parseFloat(sale.profit_amount) || 0);
        }
      });
      
      // Aggregate profit targets by month
      if (targetsData && Array.isArray(targetsData) && targetsData.length > 0) {
        targetsData.forEach(target => {
          if (target.month && target.year) {
            const monthStr = `${target.year}-${String(target.month).padStart(2, '0')}`;
            const targetProfit = (parseFloat(target.target_profit) || (parseFloat(target.target_sales) || 0) * 0.13);
            monthlyProfitTargets[monthStr] = (monthlyProfitTargets[monthStr] || 0) + targetProfit;
          }
        });
      }
      
      const sortedMonths = Object.keys(monthlyProfit).sort();
      if (sortedMonths.length > 0) {
        const ctxProfitVsTarget = document.getElementById('chartProfitVsTarget')?.getContext('2d');
        if (ctxProfitVsTarget) {
          charts.profitVsTarget = new Chart(ctxProfitVsTarget, {
            type: 'bar',
            data: {
              labels: sortedMonths,
              datasets: [
                {
                  label: 'Actual Profit (Rp)',
                  data: sortedMonths.map(m => monthlyProfit[m]),
                  backgroundColor: '#3b82f6',
                  borderRadius: 6
                },
                {
                  label: 'Target Profit (Rp)',
                  data: sortedMonths.map(m => monthlyProfitTargets[m] || 0),
                  backgroundColor: '#f59e0b',
                  borderRadius: 6
                }
              ]
            },
            options: commonOptions
          });
        }
      }
    }
    
    // 5. Sales Trend (Month to Month) with Target Line
    if (trendData && trendData.length > 0) {
      const monthlySales = {};
      trendData.forEach(sale => {
        // Use month field if transaction_date is not available
        let month = null;
        if (sale.transaction_date) {
          month = sale.transaction_date.substring(0, 7); // YYYY-MM
        } else if (sale.month) {
          month = sale.month; // Already in YYYY-MM format
        }
        
        if (month) {
          monthlySales[month] = (monthlySales[month] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      const sortedMonths = Object.keys(monthlySales).sort();
      if (sortedMonths.length > 0) {
        // Build monthly targets mapping from integer month/year fields
        const monthlyTargets = {};
        if (targetsData && Array.isArray(targetsData) && targetsData.length > 0) {
          console.log('Processing targets for sales chart:', targetsData.length, 'records');
          targetsData.forEach(target => {
            if (target.month && target.year) {
              // Build YYYY-MM format from integer fields
              const monthStr = `${target.year}-${String(target.month).padStart(2, '0')}`;
              monthlyTargets[monthStr] = (monthlyTargets[monthStr] || 0) + (parseFloat(target.target_sales) || 0);
            }
          });
          console.log('Built monthly targets:', monthlyTargets);
        } else {
          console.log('No targets data available for sales trend');
        }
        
        const ctxSalesTrend = document.getElementById('chartSalesTrend')?.getContext('2d');
        if (ctxSalesTrend) {
          const datasets = [
            {
              label: 'Sales (Rp)',
              data: sortedMonths.map(m => monthlySales[m]),
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              fill: true,
              tension: 0.4,
              borderWidth: 2
            }
          ];
          
          // Add target line if we have target data
          if (Object.keys(monthlyTargets).length > 0) {
            datasets.push({
              label: 'Target (Rp)',
              data: sortedMonths.map(m => monthlyTargets[m] || null),
              borderColor: '#f59e0b',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              fill: false,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 4
            });
          }
          
          charts.salesTrend = new Chart(ctxSalesTrend, {
            type: 'line',
            data: {
              labels: sortedMonths,
              datasets: datasets
            },
            options: {
              ...commonOptions,
              onClick: (event, elements) => {
                if (elements.length > 0 && window.drillDownUtils) {
                  const index = elements[0].index;
                  const clickedMonth = sortedMonths[index];
                  const monthData = trendData.filter(s => {
                    const month = s.transaction_date?.substring(0, 7) || s.month;
                    return month === clickedMonth;
                  });
                  window.drillDownUtils.showDrillDown(
                    `Sales Details - ${clickedMonth}`,
                    monthData,
                    ['transaction_date', 'staff_name', 'customer_name', 'product_name', 'sales_amount', 'profit_amount']
                  );
                }
              }
            }
          });
        }
      }
    }
    
    // 6. Profit Trend (Month to Month) with Target Line
    if (trendData && trendData.length > 0) {
      const monthlyProfit = {};
      trendData.forEach(sale => {
        // Use month field if transaction_date is not available
        let month = null;
        if (sale.transaction_date) {
          month = sale.transaction_date.substring(0, 7);
        } else if (sale.month) {
          month = sale.month;
        }
        
        if (month) {
          monthlyProfit[month] = (monthlyProfit[month] || 0) + (parseFloat(sale.profit_amount) || 0);
        }
      });
      
      const sortedMonths = Object.keys(monthlyProfit).sort();
      if (sortedMonths.length > 0) {
        // Build monthly profit targets from integer month/year fields
        const monthlyProfitTargets = {};
        if (targetsData && Array.isArray(targetsData) && targetsData.length > 0) {
          console.log('Processing targets for profit chart:', targetsData.length, 'records');
          targetsData.forEach(target => {
            if (target.month && target.year) {
              // Build YYYY-MM format from integer fields
              const monthStr = `${target.year}-${String(target.month).padStart(2, '0')}`;
              // Use target_profit if available, otherwise calculate 13% of target_sales
              const targetProfit = (parseFloat(target.target_profit) || (parseFloat(target.target_sales) || 0) * 0.13);
              monthlyProfitTargets[monthStr] = (monthlyProfitTargets[monthStr] || 0) + targetProfit;
            }
          });
          console.log('Built monthly profit targets:', monthlyProfitTargets);
        } else {
          console.log('No targets data available for profit trend');
        }
        
        const ctxProfitTrend = document.getElementById('chartProfitTrend')?.getContext('2d');
        if (ctxProfitTrend) {
          const datasets = [
            {
              label: 'Profit (Rp)',
              data: sortedMonths.map(m => monthlyProfit[m]),
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fill: true,
              tension: 0.4,
              borderWidth: 2
            }
          ];
          
          // Add target line if we have target data
          if (Object.keys(monthlyProfitTargets).length > 0) {
            datasets.push({
              label: 'Target (Rp)',
              data: sortedMonths.map(m => monthlyProfitTargets[m] || null),
              borderColor: '#f59e0b',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              fill: false,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 4
            });
          }
          
          charts.profitTrend = new Chart(ctxProfitTrend, {
            type: 'line',
            data: {
              labels: sortedMonths,
              datasets: datasets
            },
            options: commonOptions
          });
        }
      }
    }
    
    // 7. Top 5 Staff by Sales (Filtered by Month if Set)
    if (topStaffData && topStaffData.length > 0 && user.type === 'admin') {
      const staffSales = {};
      topStaffData.forEach(sale => {
        if (sale.staff_name) {
          staffSales[sale.staff_name] = (staffSales[sale.staff_name] || 0) + (parseFloat(sale.sales_amount) || 0);
        }
      });
      
      const sortedStaff = Object.entries(staffSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      const ctxTopStaff = document.getElementById('chartTopStaff')?.getContext('2d');
      if (ctxTopStaff && sortedStaff.length > 0) {
        charts.topStaff = new Chart(ctxTopStaff, {
          type: 'bar',
          data: {
            labels: sortedStaff.map(s => s[0]),
            datasets: [{
              label: 'Sales (Rp)',
              data: sortedStaff.map(s => s[1]),
              backgroundColor: '#8b5cf6',
              borderRadius: 8
            }]
          },
          options: {
            ...commonOptions,
            indexAxis: 'y'
          }
        });
      }
    }
    
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    window.toast?.error('Error loading dashboard: ' + err.message);
  }
}

/* === INITIALIZATION === */
window.addEventListener('DOMContentLoaded', async () => {
  const user = window.getUser();
  
  // Hide Add Sale button for non-admin users
  if (user.type !== 'admin' && el('addSaleBtn')) {
    el('addSaleBtn').style.display = 'none';
  }
  
  // Set up filter button
  const filterBtn = el('salesFilterBtn');
  if (filterBtn) {
    filterBtn.addEventListener('click', openSalesFilterModal);
  }
  
  // Handle modal submissions for filters
  document.addEventListener('modalSubmit', (e) => {
    console.log('🔍 modalSubmit event received:', e.detail);
    const { data, context } = e.detail;
    console.log('📋 Context:', context);
    console.log('📊 Data:', data);
    
    if (context && context.entity === 'sales' && context.action === 'filter') {
      console.log('✅ Filter submission detected - preventing default');
      e.preventDefault();
      applySalesFilters(data);
    }
  });
  
  // Handle filter reset
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-reset-sales-filters]')) {
      resetSalesFilters();
    }
  });
  
  await populateFilterDropdowns();
  renderDashboard();
  setInterval(renderDashboard, 60000); // Refresh every minute
  
  // Dark mode is handled by theme-toggle.js - no duplicate handler needed here
});

/* =========================================================
   CRUD FUNCTIONALITY WITH CRUDMODAL
   ========================================================= */

let salesDataForCRUD = [];
let salesFilters = { search: '' };

async function loadSalesData() {
  try {
    salesDataForCRUD = await window.fetchJson('/api/sales') || [];
    renderSalesTable();
  } catch (err) {
    console.error('Failed to load sales:', err);
    window.toast.error('Failed to load sales data');
  }
}

function renderSalesTable() {
  const tbody = el('salesTableBody');
  if (!tbody) return;
  
  // Event delegation for edit/delete buttons
  tbody.onclick = (e) => {
    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    
    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      window.editSale(id);
    } else if (deleteBtn) {
      const id = parseInt(deleteBtn.dataset.id);
      window.deleteSale(id);
    }
  };
  
  let filtered = [...salesDataForCRUD];
  if (salesFilters.search) {
    const search = salesFilters.search.toLowerCase();
    filtered = filtered.filter(s => 
      (s.staff_name || '').toLowerCase().includes(search) ||
      (s.month || '').toLowerCase().includes(search) ||
      (s.transaction_date || '').toLowerCase().includes(search)
    );
  }
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No sales found</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(item => `
    <tr class="table-row">
      <td>${item.month || item.transaction_date || '—'}</td>
      <td>${item.staff_name || '—'}</td>
      <td class="text-right"><strong>Rp ${(item.sales_amount || 0).toLocaleString('id-ID')}</strong></td>
      <td class="text-right">Rp ${(item.profit_amount || 0).toLocaleString('id-ID')}</td>
      <td class="actions">
        <button class="btn-icon" data-action="quick-view" data-id="${item.id}" title="Quick View">👁️</button>
        ${window.getUser().type === 'admin' ? `<button class="btn btn-sm btn-edit" data-id="${item.id}">✏️ Edit</button>` : ''}
        ${window.getUser().type === 'admin' ? `<button class="btn btn-sm btn-danger btn-delete" data-id="${item.id}">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
}

window.editSale = async function(id) {
  // Check admin-only access
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.type !== 'admin') {
    window.toast.error('Akses ditolak: Hanya admin yang dapat mengedit sales');
    return;
  }
  
  const item = salesDataForCRUD.find(s => s.id === id);
  if (!item) return;
  
  window.CRUDModal.edit('Edit Sales', [
    { type: 'month', name: 'month', label: 'Bulan', required: true, icon: '📅' },
    { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
    { type: 'currency', name: 'sales_amount', label: 'Sales Amount', required: true, currency: 'Rp', min: 0, step: 0.01 },
    { type: 'currency', name: 'profit_amount', label: 'Profit Amount', required: true, currency: 'Rp', min: 0, step: 0.01 }
  ], item, async (formData) => {
    // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
    ['sales_amount', 'profit_amount'].forEach(field => {
      if (formData[field]) formData[field] = window.parseFormattedNumber(formData[field]);
    });
    
    await window.fetchJson(`/api/sales/${item.id}`, { method: 'PUT', body: JSON.stringify(formData) });
    window.toast.success('Sales updated successfully');
    await Promise.all([loadSalesData(), renderDashboard()]);
  }, {
    entity: 'sales',
    validation: { month: { required: true }, staff_name: { required: true }, sales_amount: { required: true }, profit_amount: { required: true } }
  });
};

window.deleteSale = async function(id) {
  // Check admin-only access
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.type !== 'admin') {
    window.toast.error('Akses ditolak: Hanya admin yang dapat menghapus sales');
    return;
  }
  
  const item = salesDataForCRUD.find(s => s.id === id);
  if (!item) return;
  
  window.CRUDModal.delete('Sales', `${item.month || 'this sale'}`, async () => {
    await window.fetchJson(`/api/sales/${id}`, { method: 'DELETE' });
    window.toast.success('Sales deleted successfully');
    await Promise.all([loadSalesData(), renderDashboard()]);
  });
};

if (el('addSaleBtn')) {
  el('addSaleBtn').addEventListener('click', () => {
    // Check admin-only access
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user.type !== 'admin') {
      window.toast.error('Akses ditolak: Hanya admin yang dapat menambah sales');
      return;
    }
    
    window.CRUDModal.create('Add Sales', [
      { type: 'month', name: 'month', label: 'Bulan', required: true, icon: '📅' },
      { type: 'select', name: 'staff_name', label: 'Staff', required: true, options: usersData.map(u => ({ value: u.name, label: u.name })) },
      { type: 'currency', name: 'sales_amount', label: 'Sales Amount', required: true, currency: 'Rp', min: 0, step: 0.01 },
      { type: 'currency', name: 'profit_amount', label: 'Profit Amount', required: true, currency: 'Rp', min: 0, step: 0.01 }
    ], async (formData) => {
      // Clean currency fields using global parseFormattedNumber (handles Indonesian format)
      ['sales_amount', 'profit_amount'].forEach(field => {
        if (formData[field]) formData[field] = window.parseFormattedNumber(formData[field]);
      });
      
      await window.fetchJson('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
      window.toast.success('Sales added successfully');
      await Promise.all([loadSalesData(), renderDashboard()]);
    }, {
      entity: 'sales',
      validation: { month: { required: true }, staff_name: { required: true }, sales_amount: { required: true }, profit_amount: { required: true } }
    });
  });
}

if (el('searchSales')) {
  el('searchSales').addEventListener('input', (e) => {
    salesFilters.search = e.target.value;
    renderSalesTable();
  });
}

// Quick View functionality
document.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('[data-action="quick-view"]');
  if (viewBtn && window.quickView) {
    const id = viewBtn.dataset.id;
    const item = salesDataForCRUD.find(s => s.id == id);
    if (item) {
      window.quickView.open([
        {
          title: 'Transaction Information',
          fields: {
            'Invoice Number': item.invoice_no || '—',
            'Unique Code': item.unique_code || '—',
            'Transaction Date': item.transaction_date || '—',
            'Staff Name': item.staff_name || '—',
            'Region': item.region_name || '—',
            'Status': item.status || 'Pending'
          }
        },
        {
          title: 'Financial Details',
          fields: {
            'Sales Amount': (item.sales_amount || 0).toLocaleString('id-ID', {style: 'currency', currency: 'IDR'}),
            'Profit Amount': (item.profit_amount || 0).toLocaleString('id-ID', {style: 'currency', currency: 'IDR'}),
            'Profit Margin': item.sales_amount ? ((item.profit_amount / item.sales_amount) * 100).toFixed(2) + '%' : '—'
          }
        },
        {
          title: 'Additional Info',
          fields: {
            'Notes': item.notes || '—',
            'Created At': item.created_at ? new Date(item.created_at).toLocaleString() : '—',
            'Sale ID': item.id
          }
        }
      ], `Sale: ${item.invoice_no}`);
    }
  }
});

// Download CSV Template
el('downloadSalesTemplateBtn').addEventListener('click', () => {
  const csv = 'month,staff_name,sales_amount,profit_amount\n"2025-12","John Doe",10000000,2000000\n"2025-12","Jane Smith",15000000,3000000\n"2025-11","John Doe",12000000,2400000';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sales_template.csv';
  a.click();
  URL.revokeObjectURL(url);
  window.toast.success('Template downloaded');
});

// Export Sales to CSV
el('exportSalesBtn').addEventListener('click', () => {
  if (!salesDataForCRUD || salesDataForCRUD.length === 0) {
    window.toast.error('No data to export');
    return;
  }
  
  const headers = 'month,staff_name,sales_amount,profit_amount';
  const rows = salesDataForCRUD.map(s => 
    `"${s.month || ''}","${s.staff_name || ''}",${s.sales_amount || 0},${s.profit_amount || 0}`
  ).join('\n');
  
  const csv = headers + '\n' + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales_export_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  window.toast.success(`Exported ${salesDataForCRUD.length} sales records`);
});

// Import Sales from CSV
el('importSalesBtn').addEventListener('click', () => {
  el('importSalesFileInput').click();
});

el('importSalesFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const csv = event.target.result;
      const lines = csv.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      let imported = 0;
      let errors = 0;
      
      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g).map(v => v.trim().replace(/^"|"$/g, ''));
          
          // Map CSV columns: month, staff_name, sales_amount, profit_amount
          const sale = {
            month: values[0] || '',
            staff_name: values[1] || '',
            sales_amount: parseFloat(values[2]) || 0,
            profit_amount: parseFloat(values[3]) || 0
          };
          
          await window.fetchJson('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sale)
          });
          imported++;
        } catch (err) {
          console.error(`Error importing row ${i}:`, err);
          errors++;
        }
      }
      
      await Promise.all([loadSalesData(), renderDashboard()]);
      window.toast.success(`Imported ${imported} sales records${errors > 0 ? `, ${errors} errors` : ''}`);
      e.target.value = '';
    } catch (error) {
      console.error('Import failed:', error);
      window.toast.error('Import failed: ' + error.message);
    }
  };
  reader.readAsText(file);
});

// Load sales data on page load
loadSalesData();


