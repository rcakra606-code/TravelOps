/* =========================================================
   TABLE ENHANCEMENTS
   Sortable columns, export buttons, and responsive cards
   ========================================================= */

class TableEnhancer {
  constructor(tableSelector = '.table') {
    this.tables = document.querySelectorAll(tableSelector);
    this.init();
  }

  init() {
    this.tables.forEach(table => {
      this.addSortableHeaders(table);
      this.addExportButtons(table);
      this.addResponsiveCards(table);
      this.addDataLabels(table);
    });
  }

  addSortableHeaders(table) {
    const headers = table.querySelectorAll('th');
    const tbody = table.querySelector('tbody');
    
    if (!tbody) return;
    
    headers.forEach((th, index) => {
      // Skip action columns
      if (th.textContent.toLowerCase().includes('action')) return;
      
      th.classList.add('sortable');
      th.style.cursor = 'pointer';
      th.setAttribute('data-sort-dir', '');
      
      th.addEventListener('click', () => {
        const currentDir = th.getAttribute('data-sort-dir');
        const newDir = currentDir === 'asc' ? 'desc' : 'asc';
        
        // Reset other headers
        headers.forEach(h => {
          h.classList.remove('asc', 'desc');
          h.setAttribute('data-sort-dir', '');
        });
        
        th.classList.add(newDir);
        th.setAttribute('data-sort-dir', newDir);
        
        this.sortTable(table, index, newDir);
      });
    });
  }

  sortTable(table, columnIndex, direction) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    rows.sort((a, b) => {
      const aCell = a.cells[columnIndex];
      const bCell = b.cells[columnIndex];
      
      if (!aCell || !bCell) return 0;
      
      let aValue = aCell.textContent.trim();
      let bValue = bCell.textContent.trim();
      
      // Try to parse as number
      const aNum = parseFloat(aValue.replace(/[^0-9.-]/g, ''));
      const bNum = parseFloat(bValue.replace(/[^0-9.-]/g, ''));
      
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
      }
      
      // Try to parse as date
      const aDate = new Date(aValue);
      const bDate = new Date(bValue);
      
      if (!isNaN(aDate) && !isNaN(bDate)) {
        return direction === 'asc' ? aDate - bDate : bDate - aDate;
      }
      
      // String comparison
      return direction === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    });
    
    // Re-append sorted rows
    rows.forEach(row => tbody.appendChild(row));
  }

  addExportButtons(table) {
    const parent = table.closest('.card') || table.parentElement;
    
    // Check if export buttons already exist
    if (parent.querySelector('.table-export-actions')) return;
    
    const exportContainer = document.createElement('div');
    exportContainer.className = 'table-export-actions';
    exportContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
    
    exportContainer.innerHTML = `
      <button class="export-btn" data-format="csv" title="Export to CSV">
        📊 CSV
      </button>
      <button class="export-btn" data-format="excel" title="Export to Excel">
        📗 Excel
      </button>
      <button class="export-btn" data-format="print" title="Print Table">
        🖨️ Print
      </button>
    `;
    
    // Insert before table
    const tableContainer = table.closest('[style*="overflow"]') || table;
    tableContainer.parentElement.insertBefore(exportContainer, tableContainer);
    
    // Add event listeners
    exportContainer.querySelectorAll('.export-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.getAttribute('data-format');
        this.exportTable(table, format);
      });
    });
  }

  exportTable(table, format) {
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => 
      Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim())
    );
    
    switch (format) {
      case 'csv':
        this.downloadCSV(headers, rows);
        break;
      case 'excel':
        this.downloadExcel(headers, rows);
        break;
      case 'print':
        this.printTable(table);
        break;
    }
  }

  downloadCSV(headers, rows) {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    if (window.toast) {
      window.toast.success('CSV exported successfully!');
    }
  }

  downloadExcel(headers, rows) {
    // Simple HTML table to Excel export
    let html = '<table border="1"><tr>';
    html += headers.map(h => `<th style="background:#f3f4f6;font-weight:bold;">${h}</th>`).join('');
    html += '</tr>';
    
    rows.forEach(row => {
      html += '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
    });
    html += '</table>';
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `export_${new Date().toISOString().split('T')[0]}.xls`;
    link.click();
    
    if (window.toast) {
      window.toast.success('Excel file exported successfully!');
    }
  }

  printTable(table) {
    const printWindow = window.open('', '_blank');
    const clone = table.cloneNode(true);
    
    // Remove action columns
    clone.querySelectorAll('th:last-child, td:last-child').forEach(el => el.remove());
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>TravelOps Export</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f3f4f6; font-weight: bold; }
          tr:nth-child(even) { background: #f9fafb; }
          @media print {
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h2>TravelOps Export - ${new Date().toLocaleDateString()}</h2>
        ${clone.outerHTML}
        <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;cursor:pointer;">🖨️ Print</button>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  addResponsiveCards(table) {
    // Add class for responsive transformation on mobile
    table.classList.add('table-responsive-cards');
  }

  addDataLabels(table) {
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
    
    table.querySelectorAll('tbody tr').forEach(row => {
      row.querySelectorAll('td').forEach((td, index) => {
        if (headers[index]) {
          td.setAttribute('data-label', headers[index]);
        }
      });
    });
  }

  // Static method to refresh enhancements after table update
  static refresh() {
    document.querySelectorAll('.table').forEach(table => {
      const instance = new TableEnhancer();
      instance.addDataLabels(table);
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Delay initialization to allow tables to be populated
  setTimeout(() => {
    window.tableEnhancer = new TableEnhancer();
  }, 500);
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TableEnhancer;
}
