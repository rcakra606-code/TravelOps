// ============================================
// TOUR CALENDAR VIEW
// Visual calendar for upcoming tour departures
// ============================================

class TourCalendar {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.tours = [];
    this.currentMonth = new Date();
    this.selectedDate = null;
    
    if (this.container) {
      this.init();
    }
  }
  
  async init() {
    this.render();
    await this.loadTours();
  }
  
  async loadTours() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/tours', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      this.tours = await response.json() || [];
      this.renderCalendar();
    } catch (err) {
      console.error('Failed to load tours:', err);
    }
  }
  
  render() {
    this.container.innerHTML = `
      <div class="tour-calendar">
        <div class="calendar-header">
          <button class="calendar-nav" id="calPrev">‹</button>
          <h3 id="calMonthYear"></h3>
          <button class="calendar-nav" id="calNext">›</button>
        </div>
        <div class="calendar-legend">
          <span class="legend-item"><span class="legend-dot urgent"></span> Urgent (≤3 days)</span>
          <span class="legend-item"><span class="legend-dot soon"></span> Soon (4-7 days)</span>
          <span class="legend-item"><span class="legend-dot ready"></span> Ready (>7 days)</span>
        </div>
        <div class="calendar-weekdays">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
        <div class="calendar-grid" id="calendarGrid"></div>
        <div class="calendar-details" id="calendarDetails" style="display:none;">
          <h4 id="calDetailsTitle">Tours on -</h4>
          <div id="calDetailsList"></div>
        </div>
      </div>
    `;
    
    this.addStyles();
    this.bindEvents();
  }
  
  addStyles() {
    if (document.getElementById('tourCalendarStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'tourCalendarStyles';
    style.textContent = `
      .tour-calendar {
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .calendar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .calendar-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      .calendar-nav {
        width: 36px;
        height: 36px;
        border: none;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 8px;
        font-size: 20px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .calendar-nav:hover {
        background: var(--primary, #3b82f6);
        color: white;
      }
      .calendar-legend {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text-secondary, #6b7280);
      }
      .legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .legend-dot.urgent { background: #ef4444; }
      .legend-dot.soon { background: #f59e0b; }
      .legend-dot.ready { background: #10b981; }
      .calendar-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary, #6b7280);
        margin-bottom: 8px;
      }
      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
      }
      .calendar-day {
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
        background: var(--bg-alt, #f9fafb);
      }
      .calendar-day:hover {
        background: var(--border-light, #e5e7eb);
      }
      .calendar-day.other-month {
        opacity: 0.3;
      }
      .calendar-day.today {
        border: 2px solid var(--primary, #3b82f6);
        font-weight: 600;
      }
      .calendar-day.selected {
        background: var(--primary, #3b82f6);
        color: white;
      }
      .calendar-day.has-tours {
        font-weight: 600;
      }
      .calendar-day .tour-indicator {
        position: absolute;
        bottom: 4px;
        display: flex;
        gap: 2px;
      }
      .calendar-day .tour-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }
      .tour-dot.urgent { background: #ef4444; }
      .tour-dot.soon { background: #f59e0b; }
      .tour-dot.ready { background: #10b981; }
      .calendar-details {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .calendar-details h4 {
        margin: 0 0 16px 0;
        font-size: 16px;
      }
      .tour-detail-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 8px;
        margin-bottom: 8px;
        transition: all 0.2s;
      }
      .tour-detail-item:hover {
        background: var(--border-light, #e5e7eb);
      }
      .tour-detail-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }
      .tour-detail-icon.urgent { background: #fee2e2; }
      .tour-detail-icon.soon { background: #fef3c7; }
      .tour-detail-icon.ready { background: #d1fae5; }
      .tour-detail-content {
        flex: 1;
      }
      .tour-detail-title {
        font-weight: 600;
        margin-bottom: 2px;
      }
      .tour-detail-subtitle {
        font-size: 13px;
        color: var(--text-secondary, #6b7280);
      }
      .tour-detail-badge {
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
      }
      .tour-detail-badge.urgent { background: #fee2e2; color: #dc2626; }
      .tour-detail-badge.soon { background: #fef3c7; color: #d97706; }
      .tour-detail-badge.ready { background: #d1fae5; color: #059669; }
      
      .tour-checklist {
        margin-top: 8px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .checklist-item {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .checklist-item.done { background: #d1fae5; color: #059669; }
      .checklist-item.pending { background: #fee2e2; color: #dc2626; }
    `;
    document.head.appendChild(style);
  }
  
  bindEvents() {
    document.getElementById('calPrev')?.addEventListener('click', () => {
      this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
      this.renderCalendar();
    });
    
    document.getElementById('calNext')?.addEventListener('click', () => {
      this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
      this.renderCalendar();
    });
  }
  
  renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthYear = document.getElementById('calMonthYear');
    if (!grid || !monthYear) return;
    
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    monthYear.textContent = this.currentMonth.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
    
    // Get first day and days in month
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Group tours by date
    const toursByDate = {};
    this.tours.forEach(tour => {
      if (tour.departure_date) {
        const date = tour.departure_date.split('T')[0];
        if (!toursByDate[date]) toursByDate[date] = [];
        toursByDate[date].push(tour);
      }
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let html = '';
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      html += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const date = new Date(year, month, day);
      const isToday = date.getTime() === today.getTime();
      const isSelected = this.selectedDate === dateStr;
      const tours = toursByDate[dateStr] || [];
      
      let classes = ['calendar-day'];
      if (isToday) classes.push('today');
      if (isSelected) classes.push('selected');
      if (tours.length > 0) classes.push('has-tours');
      
      // Create tour indicators
      let indicators = '';
      if (tours.length > 0) {
        const dots = tours.slice(0, 3).map(t => {
          const urgency = this.getUrgency(t.departure_date);
          return `<div class="tour-dot ${urgency}"></div>`;
        }).join('');
        indicators = `<div class="tour-indicator">${dots}</div>`;
      }
      
      html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${day}${indicators}</div>`;
    }
    
    // Next month days
    const totalCells = firstDay + daysInMonth;
    const remaining = 42 - totalCells;
    for (let day = 1; day <= remaining; day++) {
      html += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    grid.innerHTML = html;
    
    // Bind click events
    grid.querySelectorAll('.calendar-day:not(.other-month)').forEach(el => {
      el.addEventListener('click', () => {
        this.selectDate(el.dataset.date);
      });
    });
  }
  
  selectDate(dateStr) {
    this.selectedDate = dateStr;
    
    // Update selection visually
    document.querySelectorAll('.calendar-day').forEach(el => {
      el.classList.toggle('selected', el.dataset.date === dateStr);
    });
    
    // Show tours for this date
    const tours = this.tours.filter(t => t.departure_date && t.departure_date.startsWith(dateStr));
    this.renderDetails(dateStr, tours);
  }
  
  renderDetails(dateStr, tours) {
    const details = document.getElementById('calendarDetails');
    const title = document.getElementById('calDetailsTitle');
    const list = document.getElementById('calDetailsList');
    
    if (!details || !title || !list) return;
    
    const date = new Date(dateStr);
    title.textContent = `Tours on ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
    
    if (tours.length === 0) {
      list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No tours scheduled</div>';
    } else {
      list.innerHTML = tours.map(tour => {
        const urgency = this.getUrgency(tour.departure_date);
        const hasInvoice = tour.invoice_number && tour.invoice_number.trim();
        const hasPayment = tour.link_pelunasan_tour && tour.link_pelunasan_tour.trim();
        
        return `
          <div class="tour-detail-item">
            <div class="tour-detail-icon ${urgency}">🧳</div>
            <div class="tour-detail-content">
              <div class="tour-detail-title">${tour.tour_code || tour.booking_code || 'Tour'}</div>
              <div class="tour-detail-subtitle">
                ${tour.lead_passenger || 'N/A'} • ${tour.jumlah_peserta || 0} pax • ${tour.staff_name || 'N/A'}
              </div>
              <div class="tour-checklist">
                <span class="checklist-item ${hasInvoice ? 'done' : 'pending'}">
                  ${hasInvoice ? '✓' : '○'} Invoice
                </span>
                <span class="checklist-item ${hasPayment ? 'done' : 'pending'}">
                  ${hasPayment ? '✓' : '○'} Payment
                </span>
                <span class="checklist-item ${tour.status === 'sudah jalan' ? 'done' : 'pending'}">
                  ${tour.status === 'sudah jalan' ? '✓' : '○'} Status
                </span>
              </div>
            </div>
            <span class="tour-detail-badge ${urgency}">${this.getUrgencyLabel(urgency)}</span>
          </div>
        `;
      }).join('');
    }
    
    details.style.display = 'block';
  }
  
  getUrgency(departureDate) {
    if (!departureDate) return 'ready';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const departure = new Date(departureDate);
    departure.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((departure - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 3) return 'urgent';
    if (diffDays <= 7) return 'soon';
    return 'ready';
  }
  
  getUrgencyLabel(urgency) {
    switch (urgency) {
      case 'urgent': return '≤3 days';
      case 'soon': return '4-7 days';
      default: return '>7 days';
    }
  }
}

// Export for use
window.TourCalendar = TourCalendar;
