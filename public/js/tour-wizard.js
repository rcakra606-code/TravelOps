/* =========================================================
   TOUR WIZARD - Multi-Step Tour Form with Passenger Details
   4 Pages: Basic Info, Passengers, Financial, Confirmation
   For data_version 2 tours (2026+)
   ========================================================= */

window.TourWizard = (function() {
  'use strict';
  
  // State management
  let wizardState = {
    currentStep: 1,
    totalSteps: 4,
    tourData: {},
    passengers: [],
    regions: [],
    users: [],
    editMode: false,
    tourId: null,
    isViewOnly: false
  };
  
  // Modal element
  let wizardModal = null;
  
  // Initialize wizard with required data
  function init(regions, users) {
    wizardState.regions = regions || [];
    wizardState.users = users || [];
  }
  
  // Open wizard for creating new tour
  function create() {
    wizardState.editMode = false;
    wizardState.tourId = null;
    wizardState.currentStep = 1;
    wizardState.tourData = {
      registration_date: new Date().toISOString().split('T')[0],
      status: 'belum jalan',
      jumlah_peserta: 1
    };
    wizardState.passengers = [createEmptyPassenger(true)]; // Start with 1 lead passenger
    wizardState.isViewOnly = false;
    
    renderWizard();
  }
  
  // Open wizard for editing existing tour
  async function edit(tourId) {
    try {
      // Fetch tour with passengers
      const tour = await window.fetchJson(`/api/tours/v2/${tourId}`);
      
      wizardState.editMode = true;
      wizardState.tourId = tourId;
      wizardState.currentStep = 1;
      wizardState.tourData = { ...tour };
      
      // Check if 2025 tour (view-only)
      const depYear = tour.departure_date ? new Date(tour.departure_date).getFullYear() : 2025;
      wizardState.isViewOnly = depYear <= 2025;
      
      // Load passengers for data_version 2, or create from old format
      if (tour.data_version === 2 && tour.passengers) {
        wizardState.passengers = tour.passengers.map(p => ({
          name: p.name || '',
          phone_number: p.phone_number || '',
          email: p.email || '',
          base_price: p.base_price || 0,
          discount: p.discount || 0,
          profit: p.profit || 0,
          is_lead_passenger: p.is_lead_passenger
        }));
      } else {
        // Convert old format to new
        wizardState.passengers = [{
          name: tour.lead_passenger || '',
          phone_number: tour.phone_number || '',
          email: tour.email || '',
          base_price: tour.tour_price || 0,
          discount: tour.discount_amount || 0,
          profit: tour.profit_amount || 0,
          is_lead_passenger: 1
        }];
        
        // Add additional passengers from all_passengers if available
        if (tour.all_passengers) {
          const others = tour.all_passengers.split(',').map(n => n.trim()).filter(n => n && n !== tour.lead_passenger);
          others.forEach(name => {
            wizardState.passengers.push({
              name: name,
              phone_number: '',
              email: '',
              base_price: tour.tour_price || 0,
              discount: tour.discount_amount || 0,
              profit: tour.profit_amount || 0,
              is_lead_passenger: 0
            });
          });
        }
        
        // Make sure participant count matches
        while (wizardState.passengers.length < (tour.jumlah_peserta || 1)) {
          wizardState.passengers.push(createEmptyPassenger(false));
        }
      }
      
      renderWizard();
    } catch (error) {
      console.error('Error loading tour for edit:', error);
      window.toast.error('Failed to load tour data');
    }
  }
  
  // View tour (read-only)
  async function view(tourId) {
    wizardState.isViewOnly = true;
    await edit(tourId);
  }
  
  // Create empty passenger object
  function createEmptyPassenger(isLead = false) {
    return {
      name: '',
      phone_number: '',
      email: '',
      base_price: 0,
      discount: 0,
      profit: 0,
      is_lead_passenger: isLead ? 1 : 0
    };
  }
  
  // Render the wizard modal
  function renderWizard() {
    // Remove existing modal if any
    closeWizard();
    
    // Create modal container
    wizardModal = document.createElement('div');
    wizardModal.className = 'wizard-modal-overlay';
    wizardModal.innerHTML = `
      <div class="wizard-modal">
        <div class="wizard-header">
          <h2 class="wizard-title">${wizardState.editMode ? (wizardState.isViewOnly ? '👁️ View Tour' : '✏️ Edit Tour') : '✨ New Tour'}</h2>
          <button type="button" class="wizard-close" data-action="close">&times;</button>
        </div>
        
        <div class="wizard-progress">
          ${renderProgressSteps()}
        </div>
        
        <div class="wizard-body">
          ${renderCurrentStep()}
        </div>
        
        <div class="wizard-footer">
          ${renderFooterButtons()}
        </div>
      </div>
    `;
    
    document.body.appendChild(wizardModal);
    
    // Attach event listeners
    attachEventListeners();
    
    // Animate in
    requestAnimationFrame(() => {
      wizardModal.classList.add('active');
    });
  }
  
  // Render progress steps
  function renderProgressSteps() {
    const steps = [
      { num: 1, label: 'Basic Info', icon: '📋' },
      { num: 2, label: 'Passengers', icon: '👥' },
      { num: 3, label: 'Financial', icon: '💰' },
      { num: 4, label: 'Confirmation', icon: '✅' }
    ];
    
    return `
      <div class="wizard-steps">
        ${steps.map(step => `
          <div class="wizard-step ${step.num === wizardState.currentStep ? 'active' : ''} ${step.num < wizardState.currentStep ? 'completed' : ''}">
            <div class="step-icon">${step.num < wizardState.currentStep ? '✓' : step.icon}</div>
            <div class="step-label">${step.label}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Render current step content
  function renderCurrentStep() {
    switch (wizardState.currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      default: return '';
    }
  }
  
  // Step 1: Basic Info
  function renderStep1() {
    const d = wizardState.tourData;
    const disabled = wizardState.isViewOnly ? 'disabled' : '';
    
    return `
      <div class="wizard-step-content">
        <h3>📋 Basic Tour Information</h3>
        
        <div class="wizard-form-grid">
          <div class="form-group">
            <label>Registration Date *</label>
            <input type="date" name="registration_date" value="${d.registration_date || ''}" required ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Tour Code *</label>
            <input type="text" name="tour_code" value="${d.tour_code || ''}" placeholder="TRV-001" required ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Booking Code</label>
            <input type="text" name="booking_code" value="${d.booking_code || ''}" placeholder="BKG-001" ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Departure Date *</label>
            <input type="date" name="departure_date" value="${d.departure_date || ''}" required ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Return Date</label>
            <input type="date" name="return_date" value="${d.return_date || ''}" ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Region *</label>
            <select name="region_id" required ${disabled}>
              <option value="">Select Region</option>
              ${wizardState.regions.map(r => `
                <option value="${r.id}" ${d.region_id == r.id ? 'selected' : ''}>${r.region_name}</option>
              `).join('')}
            </select>
          </div>
          
          <div class="form-group">
            <label>Status *</label>
            <select name="status" required ${disabled}>
              <option value="belum jalan" ${d.status === 'belum jalan' ? 'selected' : ''}>Belum Jalan</option>
              <option value="sudah jalan" ${d.status === 'sudah jalan' ? 'selected' : ''}>Sudah Jalan</option>
              <option value="tidak jalan" ${d.status === 'tidak jalan' ? 'selected' : ''}>Tidak Jalan</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Number of Participants *</label>
            <input type="number" name="jumlah_peserta" value="${d.jumlah_peserta || 1}" min="1" max="100" required ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Staff *</label>
            <select name="staff_name" required ${disabled}>
              <option value="">Select Staff</option>
              ${wizardState.users.map(u => `
                <option value="${u.name}" ${d.staff_name === u.name ? 'selected' : ''}>${u.name}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }
  
  // Step 2: Passengers
  function renderStep2() {
    const participantCount = parseInt(wizardState.tourData.jumlah_peserta) || 1;
    const disabled = wizardState.isViewOnly ? 'disabled' : '';
    
    // Adjust passenger array to match participant count
    while (wizardState.passengers.length < participantCount) {
      wizardState.passengers.push(createEmptyPassenger(false));
    }
    while (wizardState.passengers.length > participantCount) {
      wizardState.passengers.pop();
    }
    
    return `
      <div class="wizard-step-content">
        <h3>👥 Passenger Information (${participantCount} participant${participantCount > 1 ? 's' : ''})</h3>
        <p class="wizard-hint">The first passenger is the Lead Passenger with contact details.</p>
        
        <div class="passengers-container">
          ${wizardState.passengers.map((p, i) => `
            <div class="passenger-card ${i === 0 ? 'lead-passenger' : ''}">
              <div class="passenger-header">
                <span class="passenger-number">${i === 0 ? '👤 Lead Passenger' : `👥 Passenger ${i + 1}`}</span>
              </div>
              
              <div class="passenger-form">
                <div class="form-group">
                  <label>Name *</label>
                  <input type="text" name="passenger_name_${i}" value="${p.name || ''}" placeholder="Full name" required ${disabled}>
                </div>
                
                ${i === 0 ? `
                  <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" name="passenger_phone_${i}" value="${p.phone_number || ''}" placeholder="+62..." ${disabled}>
                  </div>
                  
                  <div class="form-group">
                    <label>Email</label>
                    <input type="email" name="passenger_email_${i}" value="${p.email || ''}" placeholder="email@example.com" ${disabled}>
                  </div>
                ` : ''}
                
                <div class="form-group">
                  <label>Base Price (Rp)</label>
                  <input type="text" name="passenger_base_price_${i}" value="${formatCurrencyInput(p.base_price)}" class="currency-input" data-currency="Rp" ${disabled}>
                </div>
                
                <div class="form-group">
                  <label>Discount (Rp)</label>
                  <input type="text" name="passenger_discount_${i}" value="${formatCurrencyInput(p.discount)}" class="currency-input" data-currency="Rp" ${disabled}>
                </div>
                
                <div class="form-group">
                  <label>Profit/Commission (Rp)</label>
                  <input type="text" name="passenger_profit_${i}" value="${formatCurrencyInput(p.profit)}" class="currency-input" data-currency="Rp" ${disabled}>
                </div>
                
                <div class="passenger-subtotal">
                  <span>Net Price:</span>
                  <strong>Rp ${formatNumber(calculateNetPrice(p))}</strong>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  // Step 3: Financial Summary
  function renderStep3() {
    const totals = calculateTotals();
    const d = wizardState.tourData;
    const disabled = wizardState.isViewOnly ? 'disabled' : '';
    
    return `
      <div class="wizard-step-content">
        <h3>💰 Financial Summary</h3>
        
        <div class="financial-summary-card">
          <div class="summary-row">
            <span>Total Base Price</span>
            <strong>Rp ${formatNumber(totals.totalBasePrice)}</strong>
          </div>
          <div class="summary-row">
            <span>Total Discount</span>
            <strong class="text-danger">- Rp ${formatNumber(totals.totalDiscount)}</strong>
          </div>
          <div class="summary-row">
            <span>Total Net Sales</span>
            <strong>Rp ${formatNumber(totals.totalNetSales)}</strong>
          </div>
          <div class="summary-row highlight">
            <span>Total Profit/Commission</span>
            <strong class="text-success">Rp ${formatNumber(totals.totalProfit)}</strong>
          </div>
        </div>
        
        <div class="wizard-form-grid" style="margin-top: 24px;">
          <div class="form-group full-width">
            <label>Discount Remarks</label>
            <textarea name="discount_remarks" rows="2" placeholder="Details about discounts applied"${disabled}>${d.discount_remarks || ''}</textarea>
          </div>
          
          <div class="form-group full-width">
            <label>Remarks/Request</label>
            <textarea name="remarks_request" rows="2" placeholder="Special requests or notes"${disabled}>${d.remarks_request || ''}</textarea>
          </div>
          
          <div class="form-group">
            <label>Invoice Number</label>
            <input type="text" name="invoice_number" value="${d.invoice_number || ''}" placeholder="INV-2026-001" ${disabled}>
          </div>
          
          <div class="form-group">
            <label>Payment Link</label>
            <input type="url" name="link_pelunasan_tour" value="${d.link_pelunasan_tour || ''}" placeholder="https://..." ${disabled}>
          </div>
        </div>
      </div>
    `;
  }
  
  // Step 4: Confirmation
  function renderStep4() {
    const d = wizardState.tourData;
    const totals = calculateTotals();
    const region = wizardState.regions.find(r => r.id == d.region_id);
    
    return `
      <div class="wizard-step-content">
        <h3>✅ Review & Confirm</h3>
        
        <div class="confirmation-sections">
          <!-- Tour Details -->
          <div class="confirm-section">
            <h4>📋 Tour Details</h4>
            <div class="confirm-grid">
              <div class="confirm-item">
                <span class="label">Tour Code</span>
                <span class="value">${d.tour_code || '—'}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Booking Code</span>
                <span class="value">${d.booking_code || '—'}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Registration</span>
                <span class="value">${formatDate(d.registration_date)}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Departure</span>
                <span class="value">${formatDate(d.departure_date)}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Return</span>
                <span class="value">${formatDate(d.return_date)}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Region</span>
                <span class="value">${region ? region.region_name : '—'}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Status</span>
                <span class="value">${d.status || '—'}</span>
              </div>
              <div class="confirm-item">
                <span class="label">Staff</span>
                <span class="value">${d.staff_name || '—'}</span>
              </div>
            </div>
          </div>
          
          <!-- Passengers -->
          <div class="confirm-section">
            <h4>👥 Passengers (${wizardState.passengers.length})</h4>
            <div class="confirm-passengers-list">
              ${wizardState.passengers.map((p, i) => `
                <div class="confirm-passenger">
                  <strong>${i === 0 ? '⭐ ' : ''}${p.name || '(No name)'}</strong>
                  ${i === 0 ? `<span class="contact">${p.phone_number || ''} ${p.email ? '| ' + p.email : ''}</span>` : ''}
                  <span class="amount">Rp ${formatNumber(calculateNetPrice(p))}</span>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Financial Summary -->
          <div class="confirm-section">
            <h4>💰 Financial Summary</h4>
            <div class="confirm-financial">
              <div class="confirm-fin-row">
                <span>Total Base Price</span>
                <span>Rp ${formatNumber(totals.totalBasePrice)}</span>
              </div>
              <div class="confirm-fin-row">
                <span>Total Discount</span>
                <span class="text-danger">- Rp ${formatNumber(totals.totalDiscount)}</span>
              </div>
              <div class="confirm-fin-row total">
                <span>Total Net Sales</span>
                <span>Rp ${formatNumber(totals.totalNetSales)}</span>
              </div>
              <div class="confirm-fin-row profit">
                <span>Total Profit</span>
                <span class="text-success">Rp ${formatNumber(totals.totalProfit)}</span>
              </div>
            </div>
          </div>
          
          <!-- Additional Info -->
          ${(d.discount_remarks || d.remarks_request || d.invoice_number || d.link_pelunasan_tour) ? `
            <div class="confirm-section">
              <h4>📝 Additional Information</h4>
              <div class="confirm-grid">
                ${d.discount_remarks ? `<div class="confirm-item full"><span class="label">Discount Remarks</span><span class="value">${d.discount_remarks}</span></div>` : ''}
                ${d.remarks_request ? `<div class="confirm-item full"><span class="label">Remarks/Request</span><span class="value">${d.remarks_request}</span></div>` : ''}
                ${d.invoice_number ? `<div class="confirm-item"><span class="label">Invoice Number</span><span class="value">${d.invoice_number}</span></div>` : ''}
                ${d.link_pelunasan_tour ? `<div class="confirm-item"><span class="label">Payment Link</span><span class="value"><a href="${d.link_pelunasan_tour}" target="_blank">View Link</a></span></div>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  // Render footer buttons
  function renderFooterButtons() {
    const isFirst = wizardState.currentStep === 1;
    const isLast = wizardState.currentStep === wizardState.totalSteps;
    
    if (wizardState.isViewOnly) {
      return `
        <div class="wizard-buttons">
          <button type="button" class="btn btn-secondary" data-action="close">Close</button>
        </div>
      `;
    }
    
    return `
      <div class="wizard-buttons">
        <button type="button" class="btn btn-secondary" data-action="${isFirst ? 'close' : 'prev'}">
          ${isFirst ? 'Cancel' : '← Back'}
        </button>
        <button type="button" class="btn btn-primary" data-action="${isLast ? 'save' : 'next'}">
          ${isLast ? (wizardState.editMode ? 'Update Tour' : 'Create Tour') : 'Next →'}
        </button>
      </div>
    `;
  }
  
  // Attach event listeners
  function attachEventListeners() {
    if (!wizardModal) return;
    
    // Close button
    wizardModal.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', closeWizard);
    });
    
    // Overlay click to close
    wizardModal.addEventListener('click', (e) => {
      if (e.target === wizardModal) closeWizard();
    });
    
    // Previous button
    wizardModal.querySelectorAll('[data-action="prev"]').forEach(btn => {
      btn.addEventListener('click', goToPreviousStep);
    });
    
    // Next button
    wizardModal.querySelectorAll('[data-action="next"]').forEach(btn => {
      btn.addEventListener('click', goToNextStep);
    });
    
    // Save button
    wizardModal.querySelectorAll('[data-action="save"]').forEach(btn => {
      btn.addEventListener('click', saveTour);
    });
    
    // Form input changes
    wizardModal.querySelectorAll('input, select, textarea').forEach(input => {
      input.addEventListener('change', handleInputChange);
      input.addEventListener('input', handleInputChange);
    });
    
    // Currency input formatting
    wizardModal.querySelectorAll('.currency-input').forEach(input => {
      input.addEventListener('blur', formatCurrencyOnBlur);
      input.addEventListener('focus', removeCurrencyFormatOnFocus);
    });
    
    // Escape key to close
    document.addEventListener('keydown', handleEscapeKey);
  }
  
  // Handle escape key
  function handleEscapeKey(e) {
    if (e.key === 'Escape' && wizardModal) {
      closeWizard();
    }
  }
  
  // Handle input changes
  function handleInputChange(e) {
    const name = e.target.name;
    const value = e.target.value;
    
    // Tour data fields
    if (['registration_date', 'tour_code', 'booking_code', 'departure_date', 'return_date', 
         'region_id', 'status', 'jumlah_peserta', 'staff_name', 'discount_remarks', 
         'remarks', 'remarks_request', 'invoice_number', 'link_pelunasan_tour'].includes(name)) {
      wizardState.tourData[name] = value;
      
      // If participant count changed on step 1, we need to refresh step 2
      if (name === 'jumlah_peserta') {
        const count = parseInt(value) || 1;
        wizardState.tourData.jumlah_peserta = count;
      }
    }
    
    // Passenger fields
    if (name.startsWith('passenger_')) {
      const parts = name.split('_');
      const field = parts.slice(1, -1).join('_'); // name, phone, email, base_price, discount, profit
      const index = parseInt(parts[parts.length - 1]);
      
      if (wizardState.passengers[index]) {
        if (field === 'base_price' || field === 'discount' || field === 'profit') {
          wizardState.passengers[index][field] = parseCurrency(value);
        } else {
          wizardState.passengers[index][field] = value;
        }
        
        // Update subtotal display
        updatePassengerSubtotal(index);
      }
    }
  }
  
  // Update passenger subtotal display
  function updatePassengerSubtotal(index) {
    const card = wizardModal.querySelector(`.passenger-card:nth-child(${index + 1})`);
    if (card) {
      const subtotalEl = card.querySelector('.passenger-subtotal strong');
      if (subtotalEl) {
        const netPrice = calculateNetPrice(wizardState.passengers[index]);
        subtotalEl.textContent = `Rp ${formatNumber(netPrice)}`;
      }
    }
  }
  
  // Format currency on blur
  function formatCurrencyOnBlur(e) {
    const value = parseCurrency(e.target.value);
    e.target.value = formatCurrencyInput(value);
  }
  
  // Remove formatting on focus
  function removeCurrencyFormatOnFocus(e) {
    const value = parseCurrency(e.target.value);
    e.target.value = value || '';
  }
  
  // Go to previous step
  function goToPreviousStep() {
    if (wizardState.currentStep > 1) {
      collectCurrentStepData();
      wizardState.currentStep--;
      updateWizard();
    }
  }
  
  // Go to next step
  function goToNextStep() {
    if (validateCurrentStep()) {
      collectCurrentStepData();
      if (wizardState.currentStep < wizardState.totalSteps) {
        wizardState.currentStep++;
        updateWizard();
      }
    }
  }
  
  // Collect data from current step inputs
  function collectCurrentStepData() {
    if (!wizardModal) return;
    
    wizardModal.querySelectorAll('input, select, textarea').forEach(input => {
      const name = input.name;
      const value = input.value;
      
      // Tour data
      if (['registration_date', 'tour_code', 'booking_code', 'departure_date', 'return_date', 
           'region_id', 'status', 'jumlah_peserta', 'staff_name', 'discount_remarks', 
           'remarks', 'remarks_request', 'invoice_number', 'link_pelunasan_tour'].includes(name)) {
        wizardState.tourData[name] = value;
      }
      
      // Passenger data
      if (name.startsWith('passenger_')) {
        const parts = name.split('_');
        const field = parts.slice(1, -1).join('_');
        const index = parseInt(parts[parts.length - 1]);
        
        if (wizardState.passengers[index]) {
          if (field === 'base_price' || field === 'discount' || field === 'profit') {
            wizardState.passengers[index][field] = parseCurrency(value);
          } else {
            wizardState.passengers[index][field] = value;
          }
        }
      }
    });
  }
  
  // Validate current step
  function validateCurrentStep() {
    const errors = [];
    
    switch (wizardState.currentStep) {
      case 1:
        if (!wizardState.tourData.registration_date) errors.push('Registration date is required');
        if (!wizardState.tourData.tour_code) errors.push('Tour code is required');
        if (!wizardState.tourData.departure_date) errors.push('Departure date is required');
        if (!wizardState.tourData.region_id) errors.push('Region is required');
        if (!wizardState.tourData.staff_name) errors.push('Staff is required');
        const count = parseInt(wizardState.tourData.jumlah_peserta);
        if (!count || count < 1) errors.push('Participant count must be at least 1');
        break;
        
      case 2:
        wizardState.passengers.forEach((p, i) => {
          if (!p.name || !p.name.trim()) {
            errors.push(`Passenger ${i + 1} name is required`);
          }
        });
        break;
        
      case 3:
        // Financial step - no required fields
        break;
    }
    
    if (errors.length > 0) {
      window.toast.error(errors.join(', '));
      return false;
    }
    
    return true;
  }
  
  // Update wizard display
  function updateWizard() {
    if (!wizardModal) return;
    
    const progressEl = wizardModal.querySelector('.wizard-progress');
    const bodyEl = wizardModal.querySelector('.wizard-body');
    const footerEl = wizardModal.querySelector('.wizard-footer');
    
    if (progressEl) progressEl.innerHTML = renderProgressSteps();
    if (bodyEl) bodyEl.innerHTML = renderCurrentStep();
    if (footerEl) footerEl.innerHTML = renderFooterButtons();
    
    // Re-attach event listeners
    attachEventListeners();
  }
  
  // Save tour
  async function saveTour() {
    try {
      if (!validateCurrentStep()) return;
      
      collectCurrentStepData();
      
      // Prepare tour data - clone and clean up non-database fields
      const tourData = { ...wizardState.tourData };
      
      // Remove fields that don't belong in the database
      delete tourData.region_name;    // Joined from regions table
      delete tourData.passengers;     // Separate table
      delete tourData.id;             // Don't update the ID
      
      tourData.jumlah_peserta = parseInt(tourData.jumlah_peserta) || 1;
      tourData.region_id = parseInt(tourData.region_id) || null;
      
      // Prepare passengers data
      const passengers = wizardState.passengers.map((p, i) => ({
        name: p.name,
        phone_number: i === 0 ? p.phone_number : null,
        email: i === 0 ? p.email : null,
        base_price: parseFloat(p.base_price) || 0,
        discount: parseFloat(p.discount) || 0,
        profit: parseFloat(p.profit) || 0
      }));
      
      const payload = { tour: tourData, passengers };
      
      console.log('💾 Saving tour...', {
        editMode: wizardState.editMode,
        tourId: wizardState.tourId,
        tourData,
        passengersCount: passengers.length
      });
      
      if (wizardState.editMode) {
        const response = await window.fetchJson(`/api/tours/v2/${wizardState.tourId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        console.log('✅ Tour update response:', response);
        window.toast.success('Tour updated successfully');
      } else {
        await window.fetchJson('/api/tours/v2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        window.toast.success('Tour created successfully');
      }
      
      closeWizard();
      
      // Dispatch custom event - tours-dashboard.js handles data refresh via this event
      // (Do NOT call loadToursData/renderDashboard directly to avoid duplicate API calls)
      window.dispatchEvent(new CustomEvent('tourWizardSaved'));
      
    } catch (error) {
      console.error('Error saving tour:', error);
      window.toast.error(error.message || 'Failed to save tour');
    }
  }
  
  // Close wizard
  function closeWizard() {
    document.removeEventListener('keydown', handleEscapeKey);
    
    if (wizardModal) {
      wizardModal.classList.remove('active');
      setTimeout(() => {
        if (wizardModal && wizardModal.parentNode) {
          wizardModal.parentNode.removeChild(wizardModal);
        }
        wizardModal = null;
      }, 300);
    }
  }
  
  // Helper functions
  function calculateNetPrice(passenger) {
    const base = parseFloat(passenger.base_price) || 0;
    const discount = parseFloat(passenger.discount) || 0;
    return base - discount;
  }
  
  function calculateTotals() {
    let totalBasePrice = 0;
    let totalDiscount = 0;
    let totalProfit = 0;
    
    wizardState.passengers.forEach(p => {
      totalBasePrice += parseFloat(p.base_price) || 0;
      totalDiscount += parseFloat(p.discount) || 0;
      totalProfit += parseFloat(p.profit) || 0;
    });
    
    return {
      totalBasePrice,
      totalDiscount,
      totalNetSales: totalBasePrice - totalDiscount,
      totalProfit
    };
  }
  
  function formatNumber(num) {
    return (parseFloat(num) || 0).toLocaleString('id-ID');
  }
  
  function formatCurrencyInput(num) {
    const value = parseFloat(num) || 0;
    if (value === 0) return '';
    return value.toLocaleString('id-ID');
  }
  
  function parseCurrency(str) {
    if (!str) return 0;
    // Remove thousand separators and convert comma to dot for decimals
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
  }
  
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  }
  
  // Check if tour is editable (2026+)
  function isTourEditable(tour) {
    if (!tour || !tour.departure_date) return true;
    const depYear = new Date(tour.departure_date).getFullYear();
    return depYear >= 2026;
  }
  
  // Public API
  return {
    init,
    create,
    edit,
    view,
    isTourEditable
  };
})();
