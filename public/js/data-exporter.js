// ============================================
// DATA EXPORT COMPLIANCE MODULE
// GDPR-compliant data export with multiple formats
// ============================================

class DataExporter {
  constructor() {
    this.supportedFormats = ['csv', 'json', 'xlsx', 'pdf'];
    this.sensitiveFields = [
      'password', 'token', 'secret', 'apiKey', 'creditCard',
      'ssn', 'nationalId', 'passport'
    ];
  }
  
  // Anonymize sensitive data
  anonymize(data, fieldsToAnonymize = []) {
    if (!Array.isArray(data)) return data;
    
    const sensitivePatterns = [...this.sensitiveFields, ...fieldsToAnonymize];
    
    return data.map(row => {
      const anonymized = { ...row };
      
      Object.keys(anonymized).forEach(key => {
        const lowerKey = key.toLowerCase();
        
        // Check if field should be anonymized
        if (sensitivePatterns.some(p => lowerKey.includes(p.toLowerCase()))) {
          anonymized[key] = '[REDACTED]';
        }
        
        // Partially mask email
        if (lowerKey.includes('email') && anonymized[key]) {
          anonymized[key] = this.maskEmail(anonymized[key]);
        }
        
        // Partially mask phone
        if ((lowerKey.includes('phone') || lowerKey.includes('telp') || lowerKey.includes('hp')) && anonymized[key]) {
          anonymized[key] = this.maskPhone(anonymized[key]);
        }
      });
      
      return anonymized;
    });
  }
  
  maskEmail(email) {
    if (!email || typeof email !== 'string') return email;
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal = local.charAt(0) + '***' + (local.length > 1 ? local.charAt(local.length - 1) : '');
    return `${maskedLocal}@${domain}`;
  }
  
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) return phone;
    return digits.slice(0, 3) + '****' + digits.slice(-3);
  }
  
  // Export to CSV
  exportToCSV(data, filename, options = {}) {
    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }
    
    // Anonymize if requested
    if (options.anonymize) {
      data = this.anonymize(data, options.sensitiveFields);
    }
    
    // Get headers
    const headers = options.headers || Object.keys(data[0]);
    
    // Build CSV content
    const csvContent = [
      // Header row
      headers.map(h => `"${h}"`).join(','),
      // Data rows
      ...data.map(row => 
        headers.map(h => {
          let value = row[h];
          if (value === null || value === undefined) value = '';
          if (typeof value === 'object') value = JSON.stringify(value);
          // Escape quotes and wrap in quotes
          return `"${String(value).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    // Add BOM for Excel compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
    
    this.downloadFile(blob, `${filename}.csv`);
    
    // Log export for audit
    this.logExport(filename, 'csv', data.length, options.anonymize);
    
    return true;
  }
  
  // Export to JSON
  exportToJSON(data, filename, options = {}) {
    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }
    
    if (options.anonymize) {
      data = this.anonymize(data, options.sensitiveFields);
    }
    
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    
    this.downloadFile(blob, `${filename}.json`);
    this.logExport(filename, 'json', data.length, options.anonymize);
    
    return true;
  }
  
  // Export to Excel-compatible format (using simple XLSX structure)
  exportToExcel(data, filename, options = {}) {
    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }
    
    if (options.anonymize) {
      data = this.anonymize(data, options.sensitiveFields);
    }
    
    const headers = options.headers || Object.keys(data[0]);
    
    // Create simple XML spreadsheet (compatible with Excel)
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ';
    xml += 'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
    xml += '<Worksheet ss:Name="Data">\n<Table>\n';
    
    // Header row
    xml += '<Row>\n';
    headers.forEach(h => {
      xml += `<Cell><Data ss:Type="String">${this.escapeXml(h)}</Data></Cell>\n`;
    });
    xml += '</Row>\n';
    
    // Data rows
    data.forEach(row => {
      xml += '<Row>\n';
      headers.forEach(h => {
        let value = row[h];
        let type = 'String';
        
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'number') {
          type = 'Number';
        } else if (typeof value === 'boolean') {
          type = 'Boolean';
          value = value ? '1' : '0';
        } else {
          value = this.escapeXml(String(value));
        }
        
        xml += `<Cell><Data ss:Type="${type}">${value}</Data></Cell>\n`;
      });
      xml += '</Row>\n';
    });
    
    xml += '</Table>\n</Worksheet>\n</Workbook>';
    
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
    this.downloadFile(blob, `${filename}.xls`);
    this.logExport(filename, 'excel', data.length, options.anonymize);
    
    return true;
  }
  
  escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  // Export to PDF (simple text-based PDF)
  exportToPDF(data, filename, options = {}) {
    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }
    
    if (options.anonymize) {
      data = this.anonymize(data, options.sensitiveFields);
    }
    
    const headers = options.headers || Object.keys(data[0]);
    const title = options.title || filename;
    
    // Build HTML for print
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; margin-bottom: 10px; }
          .meta { font-size: 12px; color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background: #fafafa; }
          @media print {
            body { padding: 0; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="meta">
          Exported on: ${new Date().toLocaleString()}<br>
          Total records: ${data.length}
          ${options.anonymize ? '<br><em>Note: Sensitive data has been anonymized</em>' : ''}
        </div>
        <table>
          <thead>
            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    
    // Open print dialog
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    
    this.logExport(filename, 'pdf', data.length, options.anonymize);
    
    return true;
  }
  
  downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  logExport(filename, format, recordCount, anonymized) {
    if (window.auditTrail) {
      window.auditTrail.log('export', 'data', null, {
        filename,
        format,
        recordCount,
        anonymized: !!anonymized,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Show export modal with options
  showExportModal(data, defaultFilename, options = {}) {
    // Remove existing modal
    document.getElementById('exportModal')?.remove();
    
    const modal = document.createElement('div');
    modal.id = 'exportModal';
    modal.className = 'export-modal';
    modal.innerHTML = `
      <div class="export-overlay"></div>
      <div class="export-content">
        <div class="export-header">
          <h2>📥 Export Data</h2>
          <button class="export-close">&times;</button>
        </div>
        
        <div class="export-body">
          <div class="export-info">
            <span class="info-icon">📊</span>
            <span class="info-text">${data.length} records to export</span>
          </div>
          
          <div class="export-field">
            <label>Filename</label>
            <input type="text" id="exportFilename" value="${defaultFilename}" class="export-input">
          </div>
          
          <div class="export-field">
            <label>Format</label>
            <div class="export-formats">
              <label class="format-option">
                <input type="radio" name="exportFormat" value="csv" checked>
                <span class="format-card">
                  <span class="format-icon">📄</span>
                  <span class="format-name">CSV</span>
                  <span class="format-desc">Spreadsheet compatible</span>
                </span>
              </label>
              <label class="format-option">
                <input type="radio" name="exportFormat" value="excel">
                <span class="format-card">
                  <span class="format-icon">📊</span>
                  <span class="format-name">Excel</span>
                  <span class="format-desc">Microsoft Excel</span>
                </span>
              </label>
              <label class="format-option">
                <input type="radio" name="exportFormat" value="json">
                <span class="format-card">
                  <span class="format-icon">📋</span>
                  <span class="format-name">JSON</span>
                  <span class="format-desc">Data interchange</span>
                </span>
              </label>
              <label class="format-option">
                <input type="radio" name="exportFormat" value="pdf">
                <span class="format-card">
                  <span class="format-icon">📑</span>
                  <span class="format-name">PDF</span>
                  <span class="format-desc">Print-ready</span>
                </span>
              </label>
            </div>
          </div>
          
          <div class="export-field">
            <label class="checkbox-label">
              <input type="checkbox" id="exportAnonymize">
              <span>Anonymize sensitive data (GDPR compliant)</span>
            </label>
          </div>
          
          <div class="export-preview">
            <h4>Preview</h4>
            <div class="preview-table" id="exportPreview">
              ${this.renderPreview(data.slice(0, 3), options.headers)}
            </div>
          </div>
        </div>
        
        <div class="export-footer">
          <button class="export-btn secondary" id="cancelExport">Cancel</button>
          <button class="export-btn primary" id="confirmExport">
            <span>📥</span> Export
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.addModalStyles();
    
    // Bind events
    modal.querySelector('.export-overlay').onclick = () => modal.remove();
    modal.querySelector('.export-close').onclick = () => modal.remove();
    document.getElementById('cancelExport').onclick = () => modal.remove();
    
    document.getElementById('confirmExport').onclick = () => {
      const filename = document.getElementById('exportFilename').value || defaultFilename;
      const format = document.querySelector('input[name="exportFormat"]:checked').value;
      const anonymize = document.getElementById('exportAnonymize').checked;
      
      const exportOptions = {
        ...options,
        anonymize,
        title: filename
      };
      
      switch (format) {
        case 'csv':
          this.exportToCSV(data, filename, exportOptions);
          break;
        case 'excel':
          this.exportToExcel(data, filename, exportOptions);
          break;
        case 'json':
          this.exportToJSON(data, filename, exportOptions);
          break;
        case 'pdf':
          this.exportToPDF(data, filename, exportOptions);
          break;
      }
      
      modal.remove();
    };
    
    // Update preview when anonymize is toggled
    document.getElementById('exportAnonymize').addEventListener('change', (e) => {
      const previewData = e.target.checked 
        ? this.anonymize(data.slice(0, 3))
        : data.slice(0, 3);
      document.getElementById('exportPreview').innerHTML = this.renderPreview(previewData, options.headers);
    });
  }
  
  renderPreview(data, headers) {
    if (!data || data.length === 0) return '<div class="preview-empty">No data</div>';
    
    headers = headers || Object.keys(data[0]).slice(0, 5);
    
    return `
      <table class="preview-table-content">
        <thead>
          <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${data.map(row => `
            <tr>${headers.map(h => `<td>${row[h] || '-'}</td>`).join('')}</tr>
          `).join('')}
        </tbody>
      </table>
      ${data.length < 3 ? '' : '<div class="preview-more">...</div>'}
    `;
  }
  
  addModalStyles() {
    if (document.getElementById('exportStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'exportStyles';
    style.textContent = `
      .export-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .export-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.5);
      }
      .export-content {
        position: relative;
        background: var(--card, #fff);
        border-radius: 16px;
        width: 100%;
        max-width: 600px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px rgba(0,0,0,0.25);
      }
      .export-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border-light, #e5e7eb);
      }
      .export-header h2 { margin: 0; font-size: 20px; }
      .export-close {
        width: 32px;
        height: 32px;
        border: none;
        background: none;
        font-size: 24px;
        cursor: pointer;
        border-radius: 8px;
      }
      .export-close:hover { background: var(--bg-alt, #f3f4f6); }
      .export-body {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }
      .export-info {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
        margin-bottom: 20px;
      }
      .info-icon { font-size: 24px; }
      .info-text { font-weight: 500; }
      .export-field {
        margin-bottom: 20px;
      }
      .export-field > label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--text-secondary, #6b7280);
      }
      .export-input {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 14px;
      }
      .export-input:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
      }
      .export-formats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      .format-option input { display: none; }
      .format-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px 12px;
        border: 2px solid var(--border-light, #e5e7eb);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .format-option input:checked + .format-card {
        border-color: var(--primary, #3b82f6);
        background: var(--primary-light, #eff6ff);
      }
      .format-card:hover {
        border-color: var(--primary, #3b82f6);
      }
      .format-icon { font-size: 28px; margin-bottom: 8px; }
      .format-name { font-weight: 600; font-size: 14px; }
      .format-desc { font-size: 11px; color: var(--text-secondary); text-align: center; }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
      }
      .checkbox-label input {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      .export-preview {
        margin-top: 20px;
      }
      .export-preview h4 {
        margin: 0 0 12px 0;
        font-size: 13px;
        color: var(--text-secondary);
      }
      .preview-table {
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        overflow: hidden;
      }
      .preview-table-content {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .preview-table-content th {
        background: var(--bg-alt, #f9fafb);
        padding: 8px;
        text-align: left;
        font-weight: 600;
      }
      .preview-table-content td {
        padding: 8px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .preview-more {
        text-align: center;
        padding: 8px;
        color: var(--text-secondary);
      }
      .export-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        padding: 16px 24px;
        border-top: 1px solid var(--border-light, #e5e7eb);
      }
      .export-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        border: none;
      }
      .export-btn.secondary {
        background: var(--bg-alt, #f3f4f6);
        color: var(--text, #1f2937);
      }
      .export-btn.primary {
        background: var(--primary, #3b82f6);
        color: white;
      }
      .export-btn.primary:hover {
        background: var(--primary-dark, #2563eb);
      }
      
      @media (max-width: 640px) {
        .export-formats {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;
    document.head.appendChild(style);
  }
}

// Export
window.DataExporter = DataExporter;
window.dataExporter = new DataExporter();
