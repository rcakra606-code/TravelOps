/**
 * PDF Export for Reports
 * Generate PDF reports from dashboard data
 */

class PDFExporter {
  constructor() {
    this.init();
  }

  init() {
    // Add jsPDF library dynamically if not present
    if (!window.jspdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = () => {
        // Also load autoTable plugin
        const tableScript = document.createElement('script');
        tableScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
        document.head.appendChild(tableScript);
      };
      document.head.appendChild(script);
    }
  }

  /**
   * Generate PDF report from table data
   * @param {Object} options - Configuration options
   */
  async generateReport(options = {}) {
    const {
      title = 'TravelOps Report',
      subtitle = '',
      tableId = null,
      tableData = null,
      columns = [],
      filename = 'report.pdf',
      orientation = 'portrait',
      includeMetrics = true,
      metricsSelector = '.dashboard-metrics'
    } = options;

    // Wait for jsPDF to load
    if (!window.jspdf) {
      window.toast?.error('PDF library not loaded. Please try again.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation,
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Header
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('🚀 TravelOps', margin, 15);
    
    doc.setFontSize(16);
    doc.text(title, margin, 25);
    
    if (subtitle) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(subtitle, margin, 32);
    }

    yPos = 45;

    // Reset text color
    doc.setTextColor(0, 0, 0);

    // Date generated
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${new Date().toLocaleString('id-ID')}`, margin, yPos);
    yPos += 10;

    // Include metrics if available
    if (includeMetrics) {
      const metricsContainer = document.querySelector(metricsSelector);
      if (metricsContainer) {
        const metrics = [];
        metricsContainer.querySelectorAll('.metric-card').forEach(card => {
          const title = card.querySelector('.metric-title')?.textContent || '';
          const value = card.querySelector('.metric-value')?.textContent || '';
          if (title && value) {
            metrics.push({ title, value });
          }
        });

        if (metrics.length > 0) {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(59, 130, 246);
          doc.text('Summary', margin, yPos);
          yPos += 8;

          // Draw metrics boxes
          const boxWidth = (pageWidth - margin * 2 - 10 * (Math.min(metrics.length, 4) - 1)) / Math.min(metrics.length, 4);
          metrics.slice(0, 4).forEach((metric, i) => {
            const xPos = margin + i * (boxWidth + 10);
            
            // Box background
            doc.setFillColor(249, 250, 251);
            doc.roundedRect(xPos, yPos, boxWidth, 25, 3, 3, 'F');
            
            // Metric value
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(31, 41, 55);
            doc.text(metric.value, xPos + boxWidth / 2, yPos + 12, { align: 'center' });
            
            // Metric title
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(107, 114, 128);
            doc.text(metric.title, xPos + boxWidth / 2, yPos + 20, { align: 'center' });
          });

          yPos += 35;
        }
      }
    }

    // Get table data
    let data = tableData;
    let headers = columns;

    if (!data && tableId) {
      const table = document.getElementById(tableId) || document.querySelector(tableId);
      if (table) {
        const result = this.extractTableData(table);
        data = result.data;
        headers = result.headers;
      }
    }

    if (data && data.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(59, 130, 246);
      doc.text('Data', margin, yPos);
      yPos += 5;

      // Generate table
      doc.autoTable({
        startY: yPos,
        head: [headers],
        body: data,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [229, 231, 235],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [59, 130, 246],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251]
        },
        columnStyles: {
          0: { cellWidth: 'auto' }
        }
      });
    }

    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      doc.text(
        '© TravelOps - Travel Agency Management',
        pageWidth - margin,
        pageHeight - 10,
        { align: 'right' }
      );
    }

    // Save
    doc.save(filename);
    window.toast?.success('PDF report generated successfully');
  }

  /**
   * Extract data from HTML table
   */
  extractTableData(table) {
    const headers = [];
    const data = [];

    // Get headers
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      headerRow.querySelectorAll('th').forEach(th => {
        const text = th.textContent?.trim();
        // Skip actions column
        if (text && !text.toLowerCase().includes('action')) {
          headers.push(text);
        }
      });
    }

    // Get data rows
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(tr => {
        // Skip empty/loading rows
        if (tr.textContent?.includes('Loading') || tr.textContent?.includes('No records')) {
          return;
        }

        const rowData = [];
        tr.querySelectorAll('td').forEach((td, i) => {
          // Skip actions column (usually last)
          if (i < headers.length) {
            // Get text content, strip emojis and clean up
            let text = td.textContent?.trim() || '';
            text = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
            rowData.push(text);
          }
        });

        if (rowData.length > 0 && rowData.some(cell => cell)) {
          data.push(rowData);
        }
      });
    }

    return { headers, data };
  }

  /**
   * Quick export current page table
   */
  exportCurrentTable() {
    const table = document.querySelector('.table, .data-table, .dashboard-table');
    if (!table) {
      window.toast?.error('No table found to export');
      return;
    }

    const pageTitle = document.querySelector('h2, .header h2')?.textContent?.trim() || 'Report';
    const dashboardName = this.detectDashboard();

    this.generateReport({
      title: pageTitle.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim(),
      subtitle: `${dashboardName} Dashboard`,
      tableId: table.id || '.table',
      filename: `${dashboardName.toLowerCase()}_report_${new Date().toISOString().split('T')[0]}.pdf`
    });
  }

  detectDashboard() {
    const path = window.location.pathname;
    if (path.includes('sales')) return 'Sales';
    if (path.includes('tours')) return 'Tours';
    if (path.includes('documents')) return 'Documents';
    if (path.includes('tracking')) return 'Tracking';
    if (path.includes('targets')) return 'Targets';
    if (path.includes('telecom')) return 'Telecom';
    if (path.includes('hotel')) return 'Hotel';
    if (path.includes('overtime')) return 'Overtime';
    if (path.includes('cruise')) return 'Cruise';
    if (path.includes('outstanding')) return 'Outstanding';
    if (path.includes('reports')) return 'Reports';
    return 'TravelOps';
  }
}

// Initialize and expose globally
window.pdfExporter = new PDFExporter();

// Add PDF export button to existing export dropdowns/buttons
document.addEventListener('DOMContentLoaded', () => {
  // Find export buttons and add PDF option
  setTimeout(() => {
    const exportBtns = document.querySelectorAll('[id*="export"], [id*="Export"]');
    exportBtns.forEach(btn => {
      // Skip if already has PDF sibling
      if (btn.parentElement?.querySelector('.pdf-export-btn')) return;
      
      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'btn pdf-export-btn';
      pdfBtn.innerHTML = '📄 PDF';
      pdfBtn.title = 'Export to PDF';
      pdfBtn.style.marginLeft = '8px';
      pdfBtn.addEventListener('click', () => window.pdfExporter.exportCurrentTable());
      
      btn.parentElement?.insertBefore(pdfBtn, btn.nextSibling);
    });
  }, 1000);
});
