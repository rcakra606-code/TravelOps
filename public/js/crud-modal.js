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
    const modal = new CRUDModal();
    
    if (options.multiStep) {
      return modal.showMultiStepModal(title, fields, onSubmit, options);
    }
    
    const formBuilder = new FormBuilder();
    formBuilder.addFields(fields);
    const formHtml = formBuilder.build();

    window.openModal({
      title: `➕ ${title}`,
      size: options.size || 'medium',
      bodyHtml: formHtml,
      context: { entity: options.entity, action: 'create' }
    });

    setTimeout(() => {
      const form = document.querySelector('#modalContent form');
      if (form) {
        FormBuilder.enhance(form);
        
        // Setup validation
        if (options.validation) {
          const validator = new FormValidator(form, options.validation);
          validator.setupRealtimeValidation();
          
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validator.validate()) {
              window.toast.error('Please fix the errors in the form');
              return;
            }
            
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        } else {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        }
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
      const form = document.querySelector('#modalContent form');
      if (form) {
        FormBuilder.enhance(form);
        
        // Setup validation
        if (options.validation) {
          const validator = new FormValidator(form, options.validation);
          validator.setupRealtimeValidation();
          
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validator.validate()) {
              window.toast.error('Please fix the errors in the form');
              return;
            }
            
            await CRUDModal.handleSubmit(form, onSubmit);
          });
        } else {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
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
    const container = document.querySelector('#modalContent');
    const form = container.querySelector('form');
    
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
    const modalContent = document.querySelector('#modalContent');
    
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
    const submitBtn = form.querySelector('[type="submit"]');
    const originalText = submitBtn?.textContent;
    
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    try {
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      await onSubmit(data);
      
      window.closeModal();
      window.toast.success('Saved successfully!');
    } catch (error) {
      window.toast.error('Failed to save: ' + error.message);
      
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
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
