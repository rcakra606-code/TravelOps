/**
 * Enhanced CRUD Form Builder
 * Beautiful, accessible forms with validation, auto-complete, and smart inputs
 */

class FormBuilder {
  constructor(options = {}) {
    this.fields = [];
    this.validation = {};
    this.theme = options.theme || 'default';
  }

  /**
   * Add field to form
   */
  addField(config) {
    this.fields.push(config);
    return this;
  }

  /**
   * Add multiple fields
   */
  addFields(configs) {
    configs.forEach(config => this.addField(config));
    return this;
  }

  /**
   * Generate form HTML
   */
  build(data = {}) {
    console.log('FormBuilder.build() called with data:', data);
    console.log('Fields:', this.fields.map(f => f.name));
    const formHtml = `
      <div class="enhanced-form">
        ${this.fields.map((field, index) => this.renderField(field, data, index)).join('')}
      </div>
    `;
    return formHtml;
  }

  /**
   * Render individual field
   */
  renderField(field, data, index) {
    const value = data[field.name] || field.defaultValue || '';
    console.log(`Field ${field.name}: data[${field.name}] = ${data[field.name]}, using value: ${value}`);
    const required = field.required ? '*' : '';
    const gridClass = field.fullWidth ? 'form-field-full' : 'form-field';
    const fieldId = `field-${field.name}-${index}`;

    let inputHtml = '';
    
    switch (field.type) {
      case 'text':
      case 'email':
      case 'url':
      case 'tel':
        inputHtml = this.renderTextInput(field, value, fieldId);
        break;
      case 'number':
      case 'currency':
        inputHtml = this.renderNumberInput(field, value, fieldId);
        break;
      case 'date':
      case 'datetime-local':
      case 'time':
        inputHtml = this.renderDateTimeInput(field, value, fieldId);
        break;
      case 'select':
        inputHtml = this.renderSelect(field, value, fieldId);
        break;
      case 'multiselect':
        inputHtml = this.renderMultiSelect(field, value, fieldId);
        break;
      case 'textarea':
        inputHtml = this.renderTextarea(field, value, fieldId);
        break;
      case 'checkbox':
        inputHtml = this.renderCheckbox(field, value, fieldId);
        break;
      case 'radio':
        inputHtml = this.renderRadio(field, value, fieldId);
        break;
      case 'file':
        inputHtml = this.renderFileInput(field, value, fieldId);
        break;
      case 'color':
        inputHtml = this.renderColorPicker(field, value, fieldId);
        break;
      case 'range':
        inputHtml = this.renderRange(field, value, fieldId);
        break;
      case 'tags':
        inputHtml = this.renderTagsInput(field, value, fieldId);
        break;
      default:
        inputHtml = this.renderTextInput(field, value, fieldId);
    }

    return `
      <div class="${gridClass}" data-field-name="${field.name}">
        <label for="${fieldId}" class="form-label">
          ${field.label}${required ? '<span class="required-star">*</span>' : ''}
          ${field.tooltip ? `<span class="field-tooltip" title="${field.tooltip}">ℹ️</span>` : ''}
        </label>
        ${inputHtml}
        ${field.hint ? `<div class="field-hint">${field.hint}</div>` : ''}
        <div class="field-error" style="display: none;"></div>
      </div>
    `;
  }

  renderTextInput(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    const icon = field.icon ? `<span class="input-icon">${field.icon}</span>` : '';
    
    return `
      <div class="input-wrapper ${field.icon ? 'has-icon' : ''}">
        ${icon}
        <input 
          type="${field.type}" 
          id="${fieldId}"
          name="${field.name}"
          value="${this.escapeHtml(value)}"
          placeholder="${field.placeholder || ''}"
          ${attrs}
          class="form-control ${field.icon ? 'with-icon' : ''}"
        >
        ${field.autocomplete ? '<div class="autocomplete-dropdown"></div>' : ''}
      </div>
    `;
  }

  renderNumberInput(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    const isCurrency = field.type === 'currency';
    const prefix = isCurrency ? (field.currency || 'Rp') : '';
    
    return `
      <div class="input-wrapper ${prefix ? 'has-prefix' : ''}">
        ${prefix ? `<span class="input-prefix">${prefix}</span>` : ''}
        <input 
          type="number" 
          id="${fieldId}"
          name="${field.name}"
          value="${value}"
          placeholder="${field.placeholder || ''}"
          ${field.min !== undefined ? `min="${field.min}"` : ''}
          ${field.max !== undefined ? `max="${field.max}"` : ''}
          ${field.step !== undefined ? `step="${field.step}"` : ''}
          ${attrs}
          class="form-control ${prefix ? 'with-prefix' : ''}"
        >
      </div>
    `;
  }

  renderDateTimeInput(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    
    return `
      <div class="input-wrapper date-input-wrapper">
        <input 
          type="${field.type}" 
          id="${fieldId}"
          name="${field.name}"
          value="${value}"
          ${field.min ? `min="${field.min}"` : ''}
          ${field.max ? `max="${field.max}"` : ''}
          ${attrs}
          class="form-control"
        >
        ${field.quickDates ? this.renderQuickDates(field) : ''}
      </div>
    `;
  }

  renderQuickDates(field) {
    return `
      <div class="quick-dates">
        <button type="button" class="quick-date-btn" data-offset="0">Today</button>
        <button type="button" class="quick-date-btn" data-offset="-1">Yesterday</button>
        <button type="button" class="quick-date-btn" data-offset="+1">Tomorrow</button>
      </div>
    `;
  }

  renderSelect(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    
    return `
      <div class="select-wrapper">
        <select 
          id="${fieldId}"
          name="${field.name}"
          ${attrs}
          class="form-control"
        >
          ${!field.required ? '<option value="">-- Select --</option>' : ''}
          ${field.options.map(opt => {
            const optValue = typeof opt === 'object' ? opt.value : opt;
            const optLabel = typeof opt === 'object' ? opt.label : opt;
            const selected = optValue == value ? 'selected' : '';
            return `<option value="${this.escapeHtml(optValue)}" ${selected}>${this.escapeHtml(optLabel)}</option>`;
          }).join('')}
        </select>
        <span class="select-arrow">▼</span>
      </div>
    `;
  }

  renderMultiSelect(field, value, fieldId) {
    const selectedValues = Array.isArray(value) ? value : (value ? value.split(',') : []);
    
    return `
      <div class="multiselect-wrapper" data-field="${field.name}">
        <div class="multiselect-display">
          <div class="selected-tags"></div>
          <input 
            type="text" 
            class="multiselect-input" 
            placeholder="${field.placeholder || 'Select options...'}"
            autocomplete="off"
          >
        </div>
        <div class="multiselect-dropdown" style="display: none;">
          ${field.options.map(opt => {
            const optValue = typeof opt === 'object' ? opt.value : opt;
            const optLabel = typeof opt === 'object' ? opt.label : opt;
            const checked = selectedValues.includes(String(optValue)) ? 'checked' : '';
            return `
              <label class="multiselect-option">
                <input 
                  type="checkbox" 
                  value="${this.escapeHtml(optValue)}"
                  ${checked}
                >
                <span>${this.escapeHtml(optLabel)}</span>
              </label>
            `;
          }).join('')}
        </div>
        <input type="hidden" name="${field.name}" value="${selectedValues.join(',')}" id="${fieldId}">
      </div>
    `;
  }

  renderTextarea(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    
    return `
      <div class="textarea-wrapper">
        <textarea 
          id="${fieldId}"
          name="${field.name}"
          placeholder="${field.placeholder || ''}"
          rows="${field.rows || 4}"
          ${field.maxlength ? `maxlength="${field.maxlength}"` : ''}
          ${attrs}
          class="form-control"
        >${this.escapeHtml(value)}</textarea>
        ${field.maxlength ? `<div class="char-counter"><span class="char-count">0</span> / ${field.maxlength}</div>` : ''}
      </div>
    `;
  }

  renderCheckbox(field, value, fieldId) {
    const checked = value === true || value === 'true' || value === '1' ? 'checked' : '';
    
    return `
      <div class="checkbox-wrapper">
        <label class="checkbox-label">
          <input 
            type="checkbox" 
            id="${fieldId}"
            name="${field.name}"
            value="1"
            ${checked}
            class="checkbox-input"
          >
          <span class="checkbox-custom"></span>
          <span class="checkbox-text">${field.checkboxLabel || field.label}</span>
        </label>
      </div>
    `;
  }

  renderRadio(field, value, fieldId) {
    return `
      <div class="radio-group">
        ${field.options.map((opt, idx) => {
          const optValue = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const checked = optValue == value ? 'checked' : '';
          const radioId = `${fieldId}-${idx}`;
          
          return `
            <label class="radio-label">
              <input 
                type="radio" 
                id="${radioId}"
                name="${field.name}"
                value="${this.escapeHtml(optValue)}"
                ${checked}
                class="radio-input"
              >
              <span class="radio-custom"></span>
              <span class="radio-text">${this.escapeHtml(optLabel)}</span>
            </label>
          `;
        }).join('')}
      </div>
    `;
  }

  renderFileInput(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    
    return `
      <div class="file-input-wrapper">
        <input 
          type="file" 
          id="${fieldId}"
          name="${field.name}"
          ${field.accept ? `accept="${field.accept}"` : ''}
          ${field.multiple ? 'multiple' : ''}
          ${attrs}
          class="file-input"
          style="display: none;"
        >
        <button type="button" class="file-button" onclick="document.getElementById('${fieldId}').click()">
          📁 Choose File${field.multiple ? 's' : ''}
        </button>
        <span class="file-name">No file chosen</span>
      </div>
    `;
  }

  renderColorPicker(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    
    return `
      <div class="color-picker-wrapper">
        <input 
          type="color" 
          id="${fieldId}"
          name="${field.name}"
          value="${value || '#3b82f6'}"
          ${attrs}
          class="color-input"
        >
        <input 
          type="text" 
          value="${value || '#3b82f6'}"
          class="color-hex"
          pattern="^#[0-9A-Fa-f]{6}$"
          placeholder="#000000"
        >
      </div>
    `;
  }

  renderRange(field, value, fieldId) {
    const attrs = this.buildAttributes(field);
    const min = field.min || 0;
    const max = field.max || 100;
    const currentValue = value || min;
    
    return `
      <div class="range-wrapper">
        <input 
          type="range" 
          id="${fieldId}"
          name="${field.name}"
          value="${currentValue}"
          min="${min}"
          max="${max}"
          step="${field.step || 1}"
          ${attrs}
          class="range-input"
        >
        <div class="range-value">${currentValue}</div>
      </div>
    `;
  }

  renderTagsInput(field, value, fieldId) {
    const tags = value ? (Array.isArray(value) ? value : value.split(',')) : [];
    
    return `
      <div class="tags-input-wrapper" data-field="${field.name}">
        <div class="tags-display">
          ${tags.map(tag => `
            <span class="tag">
              ${this.escapeHtml(tag)}
              <button type="button" class="tag-remove" data-tag="${this.escapeHtml(tag)}">×</button>
            </span>
          `).join('')}
          <input 
            type="text" 
            class="tags-input" 
            placeholder="${field.placeholder || 'Type and press Enter...'}"
            autocomplete="off"
          >
        </div>
        <input type="hidden" name="${field.name}" value="${tags.join(',')}" id="${fieldId}">
      </div>
    `;
  }

  buildAttributes(field) {
    let attrs = [];
    
    if (field.required) attrs.push('required');
    if (field.readonly) attrs.push('readonly');
    if (field.disabled) attrs.push('disabled');
    if (field.pattern) attrs.push(`pattern="${field.pattern}"`);
    if (field.maxlength) attrs.push(`maxlength="${field.maxlength}"`);
    if (field.autocomplete) attrs.push(`data-autocomplete="${field.autocomplete}"`);
    
    return attrs.join(' ');
  }

  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Initialize form enhancements after rendering
   */
  static enhance(formElement) {
    // Character counter for textareas
    formElement.querySelectorAll('textarea[maxlength]').forEach(textarea => {
      const wrapper = textarea.closest('.textarea-wrapper');
      const counter = wrapper?.querySelector('.char-count');
      
      if (counter) {
        const updateCount = () => {
          counter.textContent = textarea.value.length;
        };
        updateCount();
        textarea.addEventListener('input', updateCount);
      }
    });

    // File input display
    formElement.querySelectorAll('.file-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const fileNameEl = input.parentElement.querySelector('.file-name');
        if (fileNameEl) {
          const files = Array.from(e.target.files);
          fileNameEl.textContent = files.length > 0 
            ? files.map(f => f.name).join(', ')
            : 'No file chosen';
        }
      });
    });

    // Color picker sync
    formElement.querySelectorAll('.color-picker-wrapper').forEach(wrapper => {
      const colorInput = wrapper.querySelector('.color-input');
      const hexInput = wrapper.querySelector('.color-hex');
      
      colorInput.addEventListener('input', () => {
        hexInput.value = colorInput.value;
      });
      
      hexInput.addEventListener('input', () => {
        if (/^#[0-9A-Fa-f]{6}$/.test(hexInput.value)) {
          colorInput.value = hexInput.value;
        }
      });
    });

    // Range value display
    formElement.querySelectorAll('.range-input').forEach(input => {
      const valueDisplay = input.parentElement.querySelector('.range-value');
      
      input.addEventListener('input', () => {
        if (valueDisplay) {
          valueDisplay.textContent = input.value;
        }
      });
    });

    // Tags input
    formElement.querySelectorAll('.tags-input-wrapper').forEach(wrapper => {
      const tagsInput = wrapper.querySelector('.tags-input');
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      const tagsDisplay = wrapper.querySelector('.tags-display');
      
      const updateHidden = () => {
        const tags = Array.from(wrapper.querySelectorAll('.tag')).map(tag => 
          tag.textContent.trim().replace('×', '').trim()
        );
        hiddenInput.value = tags.join(',');
      };
      
      tagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tagsInput.value.trim()) {
          e.preventDefault();
          const tag = tagsInput.value.trim();
          
          const tagEl = document.createElement('span');
          tagEl.className = 'tag';
          tagEl.innerHTML = `
            ${tag}
            <button type="button" class="tag-remove" data-tag="${tag}">×</button>
          `;
          tagsDisplay.insertBefore(tagEl, tagsInput);
          tagsInput.value = '';
          updateHidden();
        }
      });
      
      wrapper.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-remove')) {
          e.target.parentElement.remove();
          updateHidden();
        }
      });
    });

    // Quick date buttons
    formElement.querySelectorAll('.quick-date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const offset = parseInt(btn.dataset.offset);
        const dateInput = btn.closest('.date-input-wrapper').querySelector('input[type="date"]');
        const date = new Date();
        date.setDate(date.getDate() + offset);
        dateInput.value = date.toISOString().split('T')[0];
      });
    });

    // Multi-select
    formElement.querySelectorAll('.multiselect-wrapper').forEach(wrapper => {
      const display = wrapper.querySelector('.multiselect-display');
      const dropdown = wrapper.querySelector('.multiselect-dropdown');
      const hiddenInput = wrapper.querySelector('input[type="hidden"]');
      const selectedTags = wrapper.querySelector('.selected-tags');
      
      const updateSelected = () => {
        const checked = Array.from(wrapper.querySelectorAll('input[type="checkbox"]:checked'));
        selectedTags.innerHTML = checked.map(cb => `
          <span class="tag">${cb.nextElementSibling.textContent} <button type="button" class="tag-remove" data-value="${cb.value}">×</button></span>
        `).join('');
        hiddenInput.value = checked.map(cb => cb.value).join(',');
      };
      
      display.addEventListener('click', () => {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
      });
      
      wrapper.addEventListener('change', updateSelected);
      
      wrapper.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-remove')) {
          const value = e.target.dataset.value;
          const checkbox = wrapper.querySelector(`input[value="${value}"]`);
          if (checkbox) {
            checkbox.checked = false;
            updateSelected();
          }
        }
      });
      
      updateSelected();
    });
  }
}

// Export
if (typeof window !== 'undefined') {
  window.FormBuilder = FormBuilder;
}
