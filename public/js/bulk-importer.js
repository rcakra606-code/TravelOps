// ============================================
// BULK IMPORT ENHANCEMENT MODULE
// Template downloads and validation preview
// ============================================

class BulkImporter {
  constructor() {
    this.templates = {
      sales: {
        name: 'Sales Import Template',
        columns: [
          { key: 'tgl_transfer', label: 'Date (YYYY-MM-DD)', required: true, type: 'date' },
          { key: 'sales_name', label: 'Sales Name', required: true, type: 'text' },
          { key: 'customer_name', label: 'Customer Name', required: true, type: 'text' },
          { key: 'nominal', label: 'Amount', required: true, type: 'number' },
          { key: 'invoice_number', label: 'Invoice Number', required: false, type: 'text' },
          { key: 'tour_code', label: 'Tour Code', required: false, type: 'text' },
          { key: 'tour_date', label: 'Tour Date (YYYY-MM-DD)', required: false, type: 'date' },
          { key: 'destination', label: 'Destination', required: false, type: 'text' },
          { key: 'payment_method', label: 'Payment Method', required: false, type: 'text' },
          { key: 'notes', label: 'Notes', required: false, type: 'text' }
        ]
      },
      tours: {
        name: 'Tours Import Template',
        columns: [
          { key: 'tour_code', label: 'Tour Code', required: true, type: 'text' },
          { key: 'booking_code', label: 'Booking Code', required: false, type: 'text' },
          { key: 'departure_date', label: 'Departure Date (YYYY-MM-DD)', required: true, type: 'date' },
          { key: 'lead_passenger', label: 'Lead Passenger', required: true, type: 'text' },
          { key: 'jumlah_peserta', label: 'Number of Passengers', required: true, type: 'number' },
          { key: 'staff_name', label: 'Staff Name', required: true, type: 'text' },
          { key: 'total_nominal_sales', label: 'Total Sales Amount', required: false, type: 'number' },
          { key: 'invoice_number', label: 'Invoice Number', required: false, type: 'text' },
          { key: 'status', label: 'Status', required: false, type: 'text' },
          { key: 'destination', label: 'Destination', required: false, type: 'text' }
        ]
      },
      documents: {
        name: 'Documents Import Template',
        columns: [
          { key: 'name', label: 'Document Name', required: true, type: 'text' },
          { key: 'type', label: 'Document Type', required: true, type: 'text' },
          { key: 'tour_code', label: 'Tour Code', required: false, type: 'text' },
          { key: 'customer_name', label: 'Customer Name', required: false, type: 'text' },
          { key: 'issue_date', label: 'Issue Date (YYYY-MM-DD)', required: false, type: 'date' },
          { key: 'expiry_date', label: 'Expiry Date (YYYY-MM-DD)', required: false, type: 'date' },
          { key: 'status', label: 'Status', required: false, type: 'text' },
          { key: 'notes', label: 'Notes', required: false, type: 'text' }
        ]
      }
    };
    
    this.validationResults = [];
  }
  
  // Generate CSV template
  generateCSVTemplate(type) {
    const template = this.templates[type];
    if (!template) return null;
    
    const headers = template.columns.map(c => c.label).join(',');
    const example = template.columns.map(c => {
      switch (c.type) {
        case 'date': return '2025-01-15';
        case 'number': return '1000000';
        default: return 'Example';
      }
    }).join(',');
    
    return `${headers}\n${example}`;
  }
  
  // Download template
  downloadTemplate(type, format = 'csv') {
    const template = this.templates[type];
    if (!template) return;
    
    let content, mimeType, extension;
    
    if (format === 'csv') {
      content = this.generateCSVTemplate(type);
      mimeType = 'text/csv';
      extension = 'csv';
    } else {
      // JSON format
      content = JSON.stringify({
        template: type,
        columns: template.columns,
        example: template.columns.reduce((obj, c) => {
          obj[c.key] = c.type === 'date' ? '2025-01-15' : c.type === 'number' ? 0 : '';
          return obj;
        }, {})
      }, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_import_template.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Parse CSV file
  parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });
      data.push(row);
    }
    
    return data;
  }
  
  // Handle CSV line with quotes
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    return values;
  }
  
  // Map headers to keys
  mapHeaders(data, type) {
    const template = this.templates[type];
    if (!template || data.length === 0) return data;
    
    // Create mapping from label to key
    const headerMap = {};
    template.columns.forEach(c => {
      headerMap[c.label.toLowerCase()] = c.key;
      headerMap[c.key.toLowerCase()] = c.key;
    });
    
    return data.map(row => {
      const mapped = {};
      Object.entries(row).forEach(([header, value]) => {
        const key = headerMap[header.toLowerCase()] || header;
        mapped[key] = value;
      });
      return mapped;
    });
  }
  
  // Validate data
  validateData(data, type) {
    const template = this.templates[type];
    if (!template) return { valid: false, errors: ['Unknown import type'] };
    
    const results = [];
    
    data.forEach((row, index) => {
      const rowResult = {
        row: index + 2, // +2 for 1-based indexing and header row
        data: row,
        errors: [],
        warnings: []
      };
      
      template.columns.forEach(col => {
        const value = row[col.key];
        
        // Required field check
        if (col.required && (!value || value.toString().trim() === '')) {
          rowResult.errors.push(`${col.label} is required`);
        }
        
        // Type validation
        if (value && value.toString().trim() !== '') {
          switch (col.type) {
            case 'date':
              if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                rowResult.errors.push(`${col.label} must be in YYYY-MM-DD format`);
              } else {
                const date = new Date(value);
                if (isNaN(date.getTime())) {
                  rowResult.errors.push(`${col.label} is not a valid date`);
                }
              }
              break;
            case 'number':
              const num = parseFloat(value.toString().replace(/,/g, ''));
              if (isNaN(num)) {
                rowResult.errors.push(`${col.label} must be a number`);
              } else if (num < 0) {
                rowResult.warnings.push(`${col.label} is negative`);
              }
              break;
          }
        }
      });
      
      results.push(rowResult);
    });
    
    this.validationResults = results;
    
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
    
    return {
      valid: totalErrors === 0,
      totalRows: data.length,
      validRows: results.filter(r => r.errors.length === 0).length,
      errorCount: totalErrors,
      warningCount: totalWarnings,
      results
    };
  }
  
  // Render import modal
  showImportModal(type, onImport) {
    const template = this.templates[type];
    if (!template) return;
    
    // Remove existing modal
    document.getElementById('bulkImportModal')?.remove();
    
    const modal = document.createElement('div');
    modal.id = 'bulkImportModal';
    modal.className = 'bulk-import-modal';
    modal.innerHTML = `
      <div class="bulk-import-overlay"></div>
      <div class="bulk-import-content">
        <div class="bulk-import-header">
          <h2>📥 Import ${template.name.replace(' Import Template', '')}</h2>
          <button class="bulk-import-close" id="closeImportModal">&times;</button>
        </div>
        
        <div class="bulk-import-body">
          <div class="import-step" id="importStep1">
            <h3>Step 1: Download Template</h3>
            <p>Download the template file to see the required format and columns.</p>
            <div class="template-buttons">
              <button class="template-btn csv" id="downloadCSV">
                <span>📄</span> Download CSV Template
              </button>
              <button class="template-btn json" id="downloadJSON">
                <span>📋</span> Download JSON Template
              </button>
            </div>
            
            <div class="columns-info">
              <h4>Required Columns:</h4>
              <div class="columns-list">
                ${template.columns.filter(c => c.required).map(c => 
                  `<span class="column-tag required">${c.label}</span>`
                ).join('')}
              </div>
              <h4>Optional Columns:</h4>
              <div class="columns-list">
                ${template.columns.filter(c => !c.required).map(c => 
                  `<span class="column-tag optional">${c.label}</span>`
                ).join('')}
              </div>
            </div>
          </div>
          
          <div class="import-step" id="importStep2">
            <h3>Step 2: Upload Your File</h3>
            <div class="upload-area" id="uploadArea">
              <input type="file" id="fileInput" accept=".csv,.json" hidden>
              <span class="upload-icon">📁</span>
              <p>Drag & drop your file here or <button id="browseBtn">browse</button></p>
              <small>Supported formats: CSV, JSON</small>
            </div>
            <div class="file-info" id="fileInfo" style="display: none;">
              <span class="file-icon">📄</span>
              <span class="file-name" id="fileName"></span>
              <button class="file-remove" id="removeFile">&times;</button>
            </div>
          </div>
          
          <div class="import-step" id="importStep3" style="display: none;">
            <h3>Step 3: Validation Preview</h3>
            <div class="validation-summary" id="validationSummary"></div>
            <div class="validation-table-wrapper">
              <table class="validation-table" id="validationTable">
                <thead></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
        
        <div class="bulk-import-footer">
          <button class="import-btn secondary" id="cancelImport">Cancel</button>
          <button class="import-btn primary" id="confirmImport" disabled>Import Data</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.addModalStyles();
    
    // Bind events
    let parsedData = [];
    let validation = null;
    
    document.getElementById('closeImportModal').onclick = () => modal.remove();
    document.getElementById('cancelImport').onclick = () => modal.remove();
    modal.querySelector('.bulk-import-overlay').onclick = () => modal.remove();
    
    document.getElementById('downloadCSV').onclick = () => this.downloadTemplate(type, 'csv');
    document.getElementById('downloadJSON').onclick = () => this.downloadTemplate(type, 'json');
    
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const fileInfo = document.getElementById('fileInfo');
    
    document.getElementById('browseBtn').onclick = () => fileInput.click();
    
    uploadArea.ondragover = (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    };
    
    uploadArea.ondragleave = () => uploadArea.classList.remove('dragover');
    
    uploadArea.ondrop = (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    };
    
    fileInput.onchange = () => {
      if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
    };
    
    document.getElementById('removeFile').onclick = () => {
      fileInput.value = '';
      uploadArea.style.display = 'block';
      fileInfo.style.display = 'none';
      document.getElementById('importStep3').style.display = 'none';
      document.getElementById('confirmImport').disabled = true;
      parsedData = [];
      validation = null;
    };
    
    const handleFile = async (file) => {
      document.getElementById('fileName').textContent = file.name;
      uploadArea.style.display = 'none';
      fileInfo.style.display = 'flex';
      
      const text = await file.text();
      
      if (file.name.endsWith('.json')) {
        try {
          const json = JSON.parse(text);
          parsedData = Array.isArray(json) ? json : [json];
        } catch (e) {
          alert('Invalid JSON file');
          return;
        }
      } else {
        parsedData = this.parseCSV(text);
      }
      
      parsedData = this.mapHeaders(parsedData, type);
      validation = this.validateData(parsedData, type);
      
      this.renderValidationPreview(validation, type);
      document.getElementById('importStep3').style.display = 'block';
      document.getElementById('confirmImport').disabled = !validation.valid;
    };
    
    document.getElementById('confirmImport').onclick = () => {
      if (validation && validation.valid && onImport) {
        onImport(parsedData);
        modal.remove();
      }
    };
  }
  
  renderValidationPreview(validation, type) {
    const summary = document.getElementById('validationSummary');
    const table = document.getElementById('validationTable');
    const template = this.templates[type];
    
    // Summary
    summary.innerHTML = `
      <div class="summary-stats">
        <div class="stat ${validation.valid ? 'success' : 'error'}">
          <span class="stat-icon">${validation.valid ? '✅' : '❌'}</span>
          <span class="stat-text">${validation.valid ? 'Ready to Import' : 'Errors Found'}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${validation.totalRows}</span>
          <span class="stat-label">Total Rows</span>
        </div>
        <div class="stat success">
          <span class="stat-value">${validation.validRows}</span>
          <span class="stat-label">Valid Rows</span>
        </div>
        <div class="stat ${validation.errorCount > 0 ? 'error' : ''}">
          <span class="stat-value">${validation.errorCount}</span>
          <span class="stat-label">Errors</span>
        </div>
        <div class="stat ${validation.warningCount > 0 ? 'warning' : ''}">
          <span class="stat-value">${validation.warningCount}</span>
          <span class="stat-label">Warnings</span>
        </div>
      </div>
    `;
    
    // Table
    const headers = template.columns.slice(0, 5); // Show first 5 columns
    
    table.querySelector('thead').innerHTML = `
      <tr>
        <th>Row</th>
        <th>Status</th>
        ${headers.map(h => `<th>${h.label}</th>`).join('')}
        <th>Issues</th>
      </tr>
    `;
    
    const showRows = validation.results.slice(0, 10);
    table.querySelector('tbody').innerHTML = showRows.map(r => {
      const status = r.errors.length > 0 ? 'error' : r.warnings.length > 0 ? 'warning' : 'valid';
      const issues = [...r.errors, ...r.warnings];
      
      return `
        <tr class="row-${status}">
          <td>${r.row}</td>
          <td><span class="status-badge ${status}">${status === 'valid' ? '✓' : status === 'error' ? '✗' : '!'}</span></td>
          ${headers.map(h => `<td>${r.data[h.key] || '-'}</td>`).join('')}
          <td class="issues-cell">${issues.join(', ') || '-'}</td>
        </tr>
      `;
    }).join('');
    
    if (validation.results.length > 10) {
      table.querySelector('tbody').innerHTML += `
        <tr><td colspan="${headers.length + 3}" class="more-rows">... and ${validation.results.length - 10} more rows</td></tr>
      `;
    }
  }
  
  addModalStyles() {
    if (document.getElementById('bulkImportStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'bulkImportStyles';
    style.textContent = `
      .bulk-import-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .bulk-import-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.5);
      }
      .bulk-import-content {
        position: relative;
        background: var(--card, #fff);
        border-radius: 16px;
        width: 100%;
        max-width: 800px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px rgba(0,0,0,0.25);
      }
      .bulk-import-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }
      .bulk-import-header h2 {
        margin: 0;
        font-size: 20px;
      }
      .bulk-import-close {
        width: 32px;
        height: 32px;
        border: none;
        background: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--text-secondary);
        border-radius: 8px;
      }
      .bulk-import-close:hover {
        background: var(--bg-alt, #f3f4f6);
      }
      .bulk-import-body {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }
      .import-step {
        margin-bottom: 32px;
      }
      .import-step h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        color: var(--primary, #3b82f6);
      }
      .import-step p {
        margin: 0 0 16px 0;
        color: var(--text-secondary, #6b7280);
      }
      .template-buttons {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
      }
      .template-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border: 2px dashed var(--border-light, #e5e7eb);
        border-radius: 10px;
        background: none;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }
      .template-btn:hover {
        border-color: var(--primary, #3b82f6);
        background: rgba(59, 130, 246, 0.05);
      }
      .template-btn span {
        font-size: 20px;
      }
      .columns-info h4 {
        font-size: 13px;
        margin: 16px 0 8px 0;
        color: var(--text-secondary);
      }
      .columns-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .column-tag {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
      }
      .column-tag.required {
        background: #fee2e2;
        color: #dc2626;
      }
      .column-tag.optional {
        background: #f3f4f6;
        color: #6b7280;
      }
      .upload-area {
        border: 2px dashed var(--border-light, #e5e7eb);
        border-radius: 12px;
        padding: 40px;
        text-align: center;
        transition: all 0.2s;
      }
      .upload-area.dragover {
        border-color: var(--primary, #3b82f6);
        background: rgba(59, 130, 246, 0.05);
      }
      .upload-icon {
        font-size: 48px;
        display: block;
        margin-bottom: 12px;
      }
      .upload-area p {
        margin: 0 0 8px 0;
      }
      .upload-area button {
        background: none;
        border: none;
        color: var(--primary, #3b82f6);
        cursor: pointer;
        text-decoration: underline;
      }
      .upload-area small {
        color: var(--text-secondary, #9ca3af);
      }
      .file-info {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
      }
      .file-icon {
        font-size: 24px;
      }
      .file-name {
        flex: 1;
        font-weight: 500;
      }
      .file-remove {
        width: 28px;
        height: 28px;
        border: none;
        background: var(--border-light, #e5e7eb);
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
      }
      .validation-summary {
        margin-bottom: 16px;
      }
      .summary-stats {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }
      .summary-stats .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 20px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
        min-width: 80px;
      }
      .summary-stats .stat.success { background: #d1fae5; }
      .summary-stats .stat.error { background: #fee2e2; }
      .summary-stats .stat.warning { background: #fef3c7; }
      .stat-icon { font-size: 24px; margin-bottom: 4px; }
      .stat-value { font-size: 20px; font-weight: 700; }
      .stat-label { font-size: 12px; color: var(--text-secondary); }
      .stat-text { font-size: 13px; font-weight: 500; }
      .validation-table-wrapper {
        overflow-x: auto;
        max-height: 250px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 10px;
      }
      .validation-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .validation-table th {
        background: var(--bg-alt, #f9fafb);
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        position: sticky;
        top: 0;
      }
      .validation-table td {
        padding: 10px 12px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .validation-table .row-error { background: #fef2f2; }
      .validation-table .row-warning { background: #fffbeb; }
      .status-badge {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: white;
      }
      .status-badge.valid { background: #10b981; }
      .status-badge.error { background: #ef4444; }
      .status-badge.warning { background: #f59e0b; }
      .issues-cell {
        color: #dc2626;
        font-size: 12px;
        max-width: 200px;
      }
      .more-rows {
        text-align: center;
        color: var(--text-secondary);
        font-style: italic;
      }
      .bulk-import-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        padding: 16px 24px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .import-btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .import-btn.secondary {
        background: var(--bg-alt, #f3f4f6);
        color: var(--text, #1f2937);
      }
      .import-btn.secondary:hover {
        background: var(--border-light, #e5e7eb);
      }
      .import-btn.primary {
        background: var(--primary, #3b82f6);
        color: white;
      }
      .import-btn.primary:hover:not(:disabled) {
        background: var(--primary-dark, #2563eb);
      }
      .import-btn.primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }
}

// Export
window.BulkImporter = BulkImporter;
