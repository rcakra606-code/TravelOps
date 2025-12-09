/**
 * Enhanced CRUD Modal Helper
 * Multi-step forms, better UX, validation, loading states
 */

class CRUDModal {
  constructor() {
    this.currentStep = 0;
    this.steps = [];
    this.formData = {};
  }

  /**
   * Show create modal with FormBuilder
   */
  static create(title, fields, onSubmit, options = {}) {
    console.log('🔧 CRUDModal.create called with title:', title);
    console.log('🔧 Fields count:', fields?.length);
    const modal = new CRUDModal();
    
    if (options.multiStep) {
      return modal.showMultiStepModal(title, fields, onSubmit, options);
    }
    
    const formBuilder = new FormBuilder();
    formBuilder.addFields(fields);
    const formHtml = formBuilder.build();
    
    console.log('🔧 FormBuilder.build() returned HTML length:', formHtml?.length);
    console.log('🔧 FormHTML preview:', formHtml?.substring(0, 200));

    window.openModal({
      title: `➕ ${title}`,
      size: options.size || 'medium',
      bodyHtml: formHtml,
      context: { entity: options.entity, action: 'create' }
    });
    
    console.log('🔧 openModal called, waiting 100ms for DOM...');

    setTimeout(() => {
      const form = document.querySelector('#modalForm');
      console.log('🔧 CRUDModal.create: Form found?', !!form);
      console.log('🔧 modalBody exists?', !!document.querySelector('#modalBody'));
      console.log('🔧 modalBody innerHTML length:', document.querySelector('#modalBody')?.innerHTML?.length);
      if (form) {
        FormBuilder.enhance(form);
        
        // Setup validation
        if (options.validation) {
          console.log('🔧 CRUDModal.create: Setting up validation with rules:', options.validation);
          const validator = new FormValidator(form, options.validation);
          validator.setupRealtimeValidation();
          
          // Count existing listeners (for debugging)
          const existingListeners = form.eventListeners ? form.eventListeners('submit').length : 'unknown';
          console.log('🔧 Existing submit listeners before adding:', existingListeners);
          
          // Add MOUSEDOWN listener to submit button - fires BEFORE click/submit
          const submitButton = form.querySelector('[type="submit"]');
          if (submitButton) {
            submitButton.addEventListener('mousedown', (e) => {
              console.log('🖱️🖱️🖱️ MOUSEDOWN (before click) - capturing values NOW');
              const regDateAtMousedown = form.querySelector('[name="registration_date"]');
              const tourCodeAtMousedown = form.querySelector('[name="tour_code"]');
              const depDateAtMousedown = form.querySelector('[name="departure_date"]');
              const leadPassAtMousedown = form.querySelector('[name="lead_passenger"]');
              console.log('🖱️ MOUSEDOWN - registration_date:', regDateAtMousedown?.value);
              console.log('🖱️ MOUSEDOWN - tour_code:', tourCodeAtMousedown?.value);
              console.log('🖱️ MOUSEDOWN - departure_date:', depDateAtMousedown?.value);
              console.log('🖱️ MOUSEDOWN - lead_passenger:', leadPassAtMousedown?.value);
              
              // Store in dataset for potential recovery
              e.target.dataset.mousedownValues = JSON.stringify({
                registration_date: regDateAtMousedown?.value || '',
                tour_code: tourCodeAtMousedown?.value || '',
                departure_date: depDateAtMousedown?.value || '',
                lead_passenger: leadPassAtMousedown?.value || ''
              });
            });
            
            submitButton.addEventListener('click', (e) => {
              console.log('🖱️ SUBMIT BUTTON CLICKED - capturing values at click moment');
              const regDateAtClick = form.querySelector('[name="registration_date"]');
              const tourCodeAtClick = form.querySelector('[name="tour_code"]');
              console.log('🖱️ At click - registration_date value:', regDateAtClick?.value);
              console.log('🖱️ At click - tour_code value:', tourCodeAtClick?.value);
              console.log('🖱️ At click - registration_date element:', regDateAtClick);
            });
          }
          
          form.addEventListener('submit', async (e) => {
            // Log IMMEDIATELY before preventDefault to catch any pre-submit clearing
            const regDateFieldBefore = form.querySelector('[name="registration_date"]');
            const tourCodeFieldBefore = form.querySelector('[name="tour_code"]');
            
            // Check if modalBody is inside the form
            const modalBody = document.getElementById('modalBody');
            const isModalBodyInsideForm = form.contains(modalBody);
            console.log('⚡ BEFORE preventDefault - modalBody is inside form?', isModalBodyInsideForm);
            console.log('⚡ BEFORE preventDefault - registration_date field found?', !!regDateFieldBefore);
            console.log('⚡ BEFORE preventDefault - registration_date value:', regDateFieldBefore?.value);
            console.log('⚡ BEFORE preventDefault - tour_code value:', tourCodeFieldBefore?.value);
            
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevent dashboard.js global submit handler from running
            
            console.log('🔧 Form submit event triggered (with validation)');
            console.log('🔧 Submit - Form element:', form);
            console.log('🔧 Submit - All forms on page:', document.querySelectorAll('form').length);
            
            // Check if this is still the same form from the validator
            console.log('🔧 Validator form element:', validator.form);
            console.log('🔧 Are they the same element?', form === validator.form);
            
            // Get the actual input elements AFTER preventDefault
            const regDateField = form.querySelector('[name="registration_date"]');
            const tourCodeField = form.querySelector('[name="tour_code"]');
            const departField = form.querySelector('[name="departure_date"]');
            const leadField = form.querySelector('[name="lead_passenger"]');
            
            console.log('🔧 Submit - registration_date element:', regDateField);
            console.log('🔧 Submit - registration_date value:', regDateField?.value);
            console.log('🔧 Submit - registration_date type:', regDateField?.type);
            console.log('🔧 Submit - tour_code value:', tourCodeField?.value);
            console.log('🔧 Submit - departure_date value:', departField?.value);
            console.log('🔧 Submit - lead_passenger value:', leadField?.value);
            
            // Check attributes
            console.log('🔧 Submit - registration_date getAttribute("value"):', regDateField?.getAttribute('value'));
            const isValid = validator.validate();
            console.log('🔧 Validation result:', isValid);
            if (!isValid) {
              console.log('🔧 Validation failed, not calling handleSubmit');
              window.toast.error('Please fix the errors in the form');
              return;
            }
            
            console.log('🔧 Validation passed, calling handleSubmit');
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        } else {
          form.addEventListener('submit', async (e) => {
            console.log('🔧 Form submit event triggered (no validation)');
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevent dashboard.js global submit handler from running
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        }
      } else {
        console.error('🔧 CRUDModal.create: Form NOT found in modal!');
      }
    }, 100);
  }

  /**
   * Show edit modal with FormBuilder
   */
  static edit(title, fields, data, onSubmit, options = {}) {
    const formBuilder = new FormBuilder();
    formBuilder.addFields(fields);
    const formHtml = formBuilder.build(data);

    window.openModal({
      title: `✏️ ${title}`,
      size: options.size || 'medium',
      bodyHtml: formHtml,
      context: { entity: options.entity, action: 'edit', id: data.id }
    });

    setTimeout(() => {
      const form = document.querySelector('#modalForm');
      if (form) {
        FormBuilder.enhance(form);
        
        // Setup validation
        if (options.validation) {
          const validator = new FormValidator(form, options.validation);
          validator.setupRealtimeValidation();
          
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevent dashboard.js global submit handler from running
            if (!validator.validate()) {
              window.toast.error('Please fix the errors in the form');
              return;
            }
            
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        } else {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation(); // Prevent dashboard.js global submit handler from running
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        }

        // Setup auto-save if enabled
        if (options.autoSave && window.AutoSave) {
          new AutoSave(form, `${options.entity}-edit-${data.id}`);
        }
      }
    }, 100);
  }

  /**
   * Show delete confirmation
   */
  static async delete(title, itemName, onConfirm) {
    if (window.confirmDialog) {
      const confirmed = await window.confirmDialog.show({
        title: `Delete ${title}?`,
        message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: '#dc2626',
        icon: '🗑️'
      });
      
      if (confirmed) {
        try {
          await onConfirm();
          window.toast.success(`${title} deleted successfully`);
        } catch (error) {
          window.toast.error(`Failed to delete: ${error.message}`);
        }
      }
    }
  }

  /**
   * Show multi-step form modal
   */
  showMultiStepModal(title, stepConfigs, onSubmit, options = {}) {
    this.steps = stepConfigs;
    this.currentStep = 0;
    this.formData = {};

    const modalHtml = this.renderMultiStepForm();

    window.openModal({
      title: `${title} - Step 1 of ${this.steps.length}`,
      size: options.size || 'large',
      bodyHtml: modalHtml,
      context: { entity: options.entity, action: 'create', multiStep: true }
    });

    setTimeout(() => {
      this.setupMultiStepHandlers(onSubmit);
    }, 100);
  }

  renderMultiStepForm() {
    const step = this.steps[this.currentStep];
    const formBuilder = new FormBuilder();
    formBuilder.addFields(step.fields);
    const formHtml = formBuilder.build(this.formData);

    return `
      <div class="multi-step-form">
        <!-- Progress Bar -->
        <div class="step-progress">
          ${this.steps.map((s, i) => `
            <div class="step-indicator ${i === this.currentStep ? 'active' : ''} ${i < this.currentStep ? 'completed' : ''}">
              <div class="step-circle">${i < this.currentStep ? '✓' : i + 1}</div>
              <div class="step-label">${s.title}</div>
            </div>
          `).join('<div class="step-connector"></div>')}
        </div>

        <!-- Step Content -->
        <div class="step-content">
          <h3 class="step-title">${step.title}</h3>
          ${step.description ? `<p class="step-description">${step.description}</p>` : ''}
          ${formHtml}
        </div>

        <!-- Navigation -->
        <div class="step-navigation">
          <button type="button" id="prevStepBtn" class="btn btn-secondary" ${this.currentStep === 0 ? 'style="visibility:hidden"' : ''}>
            ← Previous
          </button>
          <div class="step-counter">Step ${this.currentStep + 1} of ${this.steps.length}</div>
          <button type="button" id="nextStepBtn" class="btn btn-primary">
            ${this.currentStep === this.steps.length - 1 ? 'Submit ✓' : 'Next →'}
          </button>
        </div>
      </div>
    `;
  }

  setupMultiStepHandlers(onSubmit) {
    const form = document.querySelector('#modalForm');
    
    FormBuilder.enhance(form);

    // Next button
    const nextBtn = document.getElementById('nextStepBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', async () => {
        // Validate current step
        const step = this.steps[this.currentStep];
        if (step.validation) {
          const validator = new FormValidator(form, step.validation);
          if (!validator.validate()) {
            window.toast.error('Please fix the errors before continuing');
            return;
          }
        }

        // Collect form data
        const formData = new FormData(form);
        formData.forEach((value, key) => {
          this.formData[key] = value;
        });

        // Last step - submit
        if (this.currentStep === this.steps.length - 1) {
          nextBtn.disabled = true;
          nextBtn.textContent = 'Submitting...';
          
          try {
            await onSubmit(this.formData);
            window.closeModal();
            window.toast.success('Saved successfully!');
          } catch (error) {
            window.toast.error('Failed to save: ' + error.message);
            nextBtn.disabled = false;
            nextBtn.textContent = 'Submit ✓';
          }
        } else {
          // Go to next step
          this.currentStep++;
          this.updateStepView();
        }
      });
    }

    // Previous button
    const prevBtn = document.getElementById('prevStepBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        // Collect current data (without validation)
        const formData = new FormData(form);
        formData.forEach((value, key) => {
          this.formData[key] = value;
        });

        this.currentStep--;
        this.updateStepView();
      });
    }
  }

  updateStepView() {
    const modalTitle = document.querySelector('.modal-title');
    const modalContent = document.querySelector('#modalBody');
    
    if (modalTitle) {
      modalTitle.textContent = `Create - Step ${this.currentStep + 1} of ${this.steps.length}`;
    }

    if (modalContent) {
      const form = modalContent.querySelector('form');
      form.innerHTML = this.renderMultiStepForm();
      this.setupMultiStepHandlers();
      FormBuilder.enhance(form);
    }
  }

  /**
   * Handle form submission
   */
  static async handleSubmit(form, onSubmit) {
    console.log('🚀 CRUDModal.handleSubmit CALLED');
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn?.textContent;
    
    // Prevent double submission
    if (submitBtn && submitBtn.disabled) {
      console.log('Form already submitting, ignoring duplicate request');
      return;
    }
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
      submitBtn.style.opacity = '0.6';
    }

    try {
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      console.log('🚀 FormData entries:', Array.from(formData.entries()));
      console.log('🚀 Calling onSubmit callback with data:', data);
      await onSubmit(data);
      
      console.log('🚀 onSubmit completed successfully, closing modal');
      
      // Mark form as clean before closing to prevent unsaved changes prompt
      const modal = document.querySelector('#modal');
      if (modal) modal.dataset.dirty = 'false';
      
      // Reset submit button immediately for better UX
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = '1';
      }
      
      // Reset form immediately so it's ready for next use
      form.reset();
      
      window.closeModal(true); // Pass true to indicate confirmed close
      // Note: Success toast is shown by the onSubmit callback for specific messages
    } catch (error) {
      // Note: Error toast is shown by the onSubmit callback for specific messages
      console.error('🚀 Form submission error:', error);
      
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = '1';
      }
      
      // Re-throw to let caller handle it if needed
      throw error;
    }
  }

  /**
   * Show view/details modal
   */
  static view(title, data, fields) {
    const content = `
      <div class="view-details">
        ${fields.map(field => {
          const value = data[field.name] || '—';
          const displayValue = field.formatter ? field.formatter(value, data) : value;
          
          return `
            <div class="detail-row">
              <div class="detail-label">${field.label}</div>
              <div class="detail-value">${displayValue}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    window.openModal({
      title: `👁️ ${title}`,
      size: 'medium',
      bodyHtml: content,
      context: { action: 'view' }
    });
  }

  /**
   * Show loading modal
   */
  static loading(message = 'Processing...') {
    const content = `
      <div class="loading-modal">
        <div class="loading-spinner"></div>
        <div class="loading-message">${message}</div>
      </div>
    `;

    window.openModal({
      title: 'Please wait',
      size: 'small',
      bodyHtml: content,
      context: { action: 'loading' }
    });

    // Disable close button
    const modal = document.querySelector('.modal');
    const closeBtn = modal?.querySelector('.modal-close');
    if (closeBtn) closeBtn.style.display = 'none';
  }
}

// Export
if (typeof window !== 'undefined') {
  window.CRUDModal = CRUDModal;
}
