/* =========================================================
   UTILITY FUNCTIONS
   Date formatting, loading states, helpers
   ========================================================= */

// Date formatting utilities
const dateUtils = {
  // Format as "Dec 6, 2025"
  format(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  },

  // Format as "2025-12-06" for input fields
  formatISO(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // Relative time ("2 days ago")
  relative(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays === -1) return 'Tomorrow';
    if (diffDays > 0 && diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 0 && diffDays > -7) return `In ${Math.abs(diffDays)} days`;
    
    return this.format(dateString);
  },

  // Check if date is in range
  isInRange(dateString, startDate, endDate) {
    const date = new Date(dateString);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }
};

// Loading state utilities
const loadingUtils = {
  // Show skeleton loader in table
  showTableLoader(tableBodyId, columnCount = 7) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    
    const rows = Array(5).fill(0).map(() => `
      <tr class="skeleton-row">
        ${Array(columnCount).fill(0).map(() => `
          <td><div class="skeleton-line"></div></td>
        `).join('')}
      </tr>
    `).join('');
    
    tbody.innerHTML = rows;
    
    // Add skeleton CSS if not exists
    if (!document.getElementById('skeleton-styles')) {
      const style = document.createElement('style');
      style.id = 'skeleton-styles';
      style.textContent = `
        .skeleton-line {
          height: 16px;
          background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 4px;
        }
        [data-theme="dark"] .skeleton-line {
          background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
          background-size: 200% 100%;
        }
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `;
      document.head.appendChild(style);
    }
  },

  // Show spinner on button
  showButtonLoading(buttonElement, loadingText = 'Loading...') {
    if (!buttonElement) return null;
    
    const originalText = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <span class="spinner"></span>
        ${loadingText}
      </span>
    `;
    
    // Add spinner CSS if not exists
    if (!document.getElementById('spinner-styles')) {
      const style = document.createElement('style');
      style.id = 'spinner-styles';
      style.textContent = `
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    return {
      stop: () => {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalText;
      }
    };
  },

  // Hide loading state
  hideTableLoader(tableBodyId, emptyMessage = 'No data available') {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="20" style="text-align:center; padding: 40px; color: var(--text-secondary);">${emptyMessage}</td></tr>`;
  }
};

// Export utilities
const exportUtils = {
  // Export table data to CSV
  toCSV(data, filename, columns) {
    if (!data || data.length === 0) {
      window.toast.warning('No data to export');
      return;
    }

    // Create CSV header
    const headers = columns.map(col => col.label).join(',');
    
    // Create CSV rows
    const rows = data.map(item => {
      return columns.map(col => {
        let value = item[col.key] || '';
        // Escape quotes and wrap in quotes if contains comma
        value = String(value).replace(/"/g, '""');
        if (value.includes(',') || value.includes('\n')) {
          value = `"${value}"`;
        }
        return value;
      }).join(',');
    });

    const csv = [headers, ...rows].join('\n');
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    window.toast.success(`Exported ${data.length} records to CSV`);
  }
};

// Search/Filter utilities
const filterUtils = {
  // Filter array by search term across multiple fields
  search(data, searchTerm, fields) {
    if (!searchTerm) return data;
    
    const term = searchTerm.toLowerCase().trim();
    return data.filter(item => {
      return fields.some(field => {
        const value = item[field];
        return value && String(value).toLowerCase().includes(term);
      });
    });
  },

  // Filter by date range
  dateRange(data, dateField, startDate, endDate) {
    return data.filter(item => {
      return dateUtils.isInRange(item[dateField], startDate, endDate);
    });
  },

  // Filter by status/category
  byField(data, field, value) {
    if (!value || value === 'all') return data;
    return data.filter(item => item[field] === value);
  }
};

// Pagination utilities
const paginationUtils = {
  paginate(data, page = 1, pageSize = 25) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      data: data.slice(start, end),
      currentPage: page,
      pageSize: pageSize,
      totalPages: Math.ceil(data.length / pageSize),
      totalRecords: data.length,
      hasNext: end < data.length,
      hasPrev: page > 1
    };
  },

  renderPaginationControls(containerId, paginationData, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { currentPage, totalPages, totalRecords, hasNext, hasPrev } = paginationData;

    if (totalPages <= 1) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 0.9rem;">Showing ${totalRecords} records</div>`;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 0;">
        <div style="color: var(--text-secondary); font-size: 0.9rem;">
          Showing page ${currentPage} of ${totalPages} (${totalRecords} total records)
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" id="prevPage" ${!hasPrev ? 'disabled' : ''}>
            ← Previous
          </button>
          <button class="btn btn-secondary" id="nextPage" ${!hasNext ? 'disabled' : ''}>
            Next →
          </button>
        </div>
      </div>
    `;

    if (hasPrev) {
      document.getElementById('prevPage').onclick = () => onPageChange(currentPage - 1);
    }
    if (hasNext) {
      document.getElementById('nextPage').onclick = () => onPageChange(currentPage + 1);
    }
  }
};

// Sorting utilities
const sortUtils = {
  sort(data, field, direction = 'asc') {
    return [...data].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];

      // Handle null/undefined
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Try to parse as number
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return direction === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Try to parse as date
      const aDate = new Date(aVal);
      const bDate = new Date(bVal);
      if (!isNaN(aDate) && !isNaN(bDate)) {
        return direction === 'asc' ? aDate - bDate : bDate - aDate;
      }

      // String comparison
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      
      if (direction === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
  },

  addSortableHeaders(tableId, sortableColumns, onSort) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const headers = table.querySelectorAll('th[data-sort]');
    headers.forEach(th => {
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.innerHTML += ' <span class="sort-indicator">⇅</span>';

      th.onclick = () => {
        const field = th.dataset.sort;
        const currentDir = th.dataset.dir || 'asc';
        const newDir = currentDir === 'asc' ? 'desc' : 'asc';

        // Update all headers
        headers.forEach(h => {
          h.dataset.dir = '';
          h.querySelector('.sort-indicator').textContent = '⇅';
        });

        // Update clicked header
        th.dataset.dir = newDir;
        th.querySelector('.sort-indicator').textContent = newDir === 'asc' ? '↑' : '↓';

        onSort(field, newDir);
      };
    });
  }
};

// Export to window
window.dateUtils = dateUtils;
window.loadingUtils = loadingUtils;
window.exportUtils = exportUtils;
window.filterUtils = filterUtils;
window.paginationUtils = paginationUtils;
window.sortUtils = sortUtils;

/* =========================================================
   FORM VALIDATION UTILITIES
   ========================================================= */
const validationUtils = {
  // Validate email format
  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  // Validate phone number (Indonesian format)
  isValidPhone(phone) {
    return /^(\+62|62|0)[0-9]{9,12}$/.test(phone.replace(/[\s-]/g, ''));
  },

  // Validate required fields
  validateRequired(formId) {
    const form = document.getElementById(formId);
    if (!form) return { valid: false, errors: ['Form not found'] };

    const errors = [];
    const required = form.querySelectorAll('[required]');
    
    required.forEach(field => {
      if (!field.value.trim()) {
        errors.push(`${field.name || field.id || 'Field'} is required`);
        field.classList.add('error');
      } else {
        field.classList.remove('error');
      }
    });

    return { valid: errors.length === 0, errors };
  },

  // Show validation errors
  showErrors(errors, containerId = 'validationErrors') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (errors.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.style.cssText = `
      background: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    `;
    
    container.innerHTML = `
      <strong style="color: #991b1b;">⚠️ Validation Errors:</strong>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #dc2626;">
        ${errors.map(err => `<li>${err}</li>`).join('')}
      </ul>
    `;
  },

  // Clear validation errors
  clearErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    form.querySelectorAll('.error').forEach(field => {
      field.classList.remove('error');
    });
  }
};

/* =========================================================
   PERFORMANCE UTILITIES
   ========================================================= */
const performanceUtils = {
  // Debounce function calls
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function calls
  throttle(func, limit = 300) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Lazy load images
  lazyLoadImages(selector = 'img[data-src]') {
    const images = document.querySelectorAll(selector);
    
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.classList.add('loaded');
          observer.unobserve(img);
        }
      });
    });

    images.forEach(img => imageObserver.observe(img));
  }
};

/* =========================================================
   LOCAL STORAGE UTILITIES
   ========================================================= */
const storageUtils = {
  // Save with expiration
  setWithExpiry(key, value, ttlMs) {
    const item = {
      value: value,
      expiry: Date.now() + ttlMs
    };
    localStorage.setItem(key, JSON.stringify(item));
  },

  // Get with expiration check
  getWithExpiry(key) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;

    try {
      const item = JSON.parse(itemStr);
      if (Date.now() > item.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      return item.value;
    } catch {
      return null;
    }
  },

  // Clear old items
  clearExpired() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      this.getWithExpiry(key); // This will auto-remove expired items
    });
  }
};

// Export new utilities
window.validationUtils = validationUtils;
window.performanceUtils = performanceUtils;
window.storageUtils = storageUtils;
