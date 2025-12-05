/**
 * Advanced Search Utility
 * Fuzzy search, multi-field search, search highlighting
 */

class AdvancedSearch {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.3; // Fuzzy match threshold
    this.searchFields = options.searchFields || [];
    this.caseSensitive = options.caseSensitive || false;
    this.highlightClass = options.highlightClass || 'search-highlight';
  }

  /**
   * Fuzzy search using Levenshtein distance
   */
  fuzzyMatch(text, query) {
    if (!this.caseSensitive) {
      text = text.toLowerCase();
      query = query.toLowerCase();
    }

    // Exact match
    if (text.includes(query)) return 1;

    // Calculate similarity score
    const distance = this.levenshteinDistance(text, query);
    const maxLength = Math.max(text.length, query.length);
    const similarity = 1 - (distance / maxLength);

    return similarity >= this.threshold ? similarity : 0;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Search items by query
   */
  search(items, query, searchFields = null) {
    if (!query || query.trim() === '') return items;

    const fields = searchFields || this.searchFields;
    const results = [];

    items.forEach(item => {
      let maxScore = 0;
      let matchedField = null;

      // Search in specified fields
      if (fields.length > 0) {
        fields.forEach(field => {
          const value = this.getNestedValue(item, field);
          if (value !== null && value !== undefined) {
            const score = this.fuzzyMatch(String(value), query);
            if (score > maxScore) {
              maxScore = score;
              matchedField = field;
            }
          }
        });
      } else {
        // Search in all string values
        Object.values(item).forEach(value => {
          if (typeof value === 'string') {
            const score = this.fuzzyMatch(value, query);
            if (score > maxScore) {
              maxScore = score;
            }
          }
        });
      }

      if (maxScore > 0) {
        results.push({
          item,
          score: maxScore,
          matchedField
        });
      }
    });

    // Sort by relevance score
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Get nested object value
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => 
      current && current[prop] !== undefined ? current[prop] : null, obj);
  }

  /**
   * Highlight search term in text
   */
  highlight(text, query) {
    if (!query || !text) return text;

    const regex = new RegExp(`(${this.escapeRegex(query)})`, 
      this.caseSensitive ? 'g' : 'gi');
    
    return text.replace(regex, `<span class="${this.highlightClass}">$1</span>`);
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Advanced search with operators
   * Supports: AND, OR, NOT, exact match (""), field search (field:value)
   */
  advancedSearch(items, queryString) {
    const tokens = this.parseQuery(queryString);
    
    return items.filter(item => {
      return this.evaluateTokens(item, tokens);
    });
  }

  /**
   * Parse search query into tokens
   */
  parseQuery(query) {
    const tokens = [];
    const regex = /(\w+:\s*"[^"]+"|"[^"]+"|AND|OR|NOT|-\w+|\w+)/gi;
    let match;

    while ((match = regex.exec(query)) !== null) {
      tokens.push(match[0]);
    }

    return tokens;
  }

  /**
   * Evaluate search tokens against item
   */
  evaluateTokens(item, tokens) {
    let result = true;
    let operator = 'AND';

    tokens.forEach(token => {
      if (token === 'AND' || token === 'OR' || token === 'NOT') {
        operator = token;
        return;
      }

      const match = this.evaluateToken(item, token);

      switch (operator) {
        case 'AND':
          result = result && match;
          break;
        case 'OR':
          result = result || match;
          break;
        case 'NOT':
          result = result && !match;
          operator = 'AND'; // Reset
          break;
      }
    });

    return result;
  }

  /**
   * Evaluate single token
   */
  evaluateToken(item, token) {
    // Field search: field:value or field:"exact value"
    const fieldMatch = token.match(/^(\w+):\s*"([^"]+)"|^(\w+):(\S+)/);
    if (fieldMatch) {
      const field = fieldMatch[1] || fieldMatch[3];
      const value = fieldMatch[2] || fieldMatch[4];
      const itemValue = this.getNestedValue(item, field);
      
      if (itemValue === null || itemValue === undefined) return false;
      
      return this.fuzzyMatch(String(itemValue), value) > 0;
    }

    // Exact match: "value"
    if (token.startsWith('"') && token.endsWith('"')) {
      const value = token.slice(1, -1);
      return Object.values(item).some(v => 
        typeof v === 'string' && v.includes(value));
    }

    // Negative match: -value
    if (token.startsWith('-')) {
      const value = token.slice(1);
      return !Object.values(item).some(v => 
        typeof v === 'string' && this.fuzzyMatch(v, value) > 0);
    }

    // Regular fuzzy match
    return Object.values(item).some(v => 
      typeof v === 'string' && this.fuzzyMatch(v, token) > 0);
  }

  /**
   * Create search suggestions based on data
   */
  getSuggestions(items, query, limit = 5) {
    if (!query || query.length < 2) return [];

    const suggestions = new Set();
    const queryLower = query.toLowerCase();

    items.forEach(item => {
      this.searchFields.forEach(field => {
        const value = this.getNestedValue(item, field);
        if (value && typeof value === 'string') {
          const valueLower = value.toLowerCase();
          if (valueLower.startsWith(queryLower)) {
            suggestions.add(value);
          }
        }
      });
    });

    return Array.from(suggestions).slice(0, limit);
  }
}

// Table Search Integration
class TableSearch {
  constructor(tableSelector, options = {}) {
    this.table = document.querySelector(tableSelector);
    this.searchInput = null;
    this.advancedSearch = new AdvancedSearch(options);
    this.originalRows = [];
    
    if (this.table) {
      this.init();
    }
  }

  init() {
    this.cacheRows();
    this.createSearchInput();
  }

  cacheRows() {
    const tbody = this.table.querySelector('tbody');
    this.originalRows = Array.from(tbody.querySelectorAll('tr'));
  }

  createSearchInput() {
    const container = this.table.parentElement;
    const searchContainer = document.createElement('div');
    searchContainer.className = 'table-search-container';
    searchContainer.style.cssText = 'margin-bottom: 16px;';
    
    searchContainer.innerHTML = `
      <input type="text" 
             class="form-control" 
             placeholder="Search... (use AND, OR, NOT, field:value, or &quot;exact match&quot;)"
             style="max-width: 500px;">
    `;

    container.insertBefore(searchContainer, this.table);
    this.searchInput = searchContainer.querySelector('input');

    // Debounced search
    let timeout;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => this.performSearch(e.target.value), 300);
    });
  }

  performSearch(query) {
    const tbody = this.table.querySelector('tbody');
    
    if (!query.trim()) {
      // Show all rows
      this.originalRows.forEach(row => row.style.display = '');
      return;
    }

    // Extract data from rows
    const items = this.originalRows.map(row => {
      const cells = row.querySelectorAll('td');
      const data = {};
      cells.forEach((cell, index) => {
        data[`col${index}`] = cell.textContent.trim();
      });
      data._row = row;
      return data;
    });

    // Search
    const results = this.advancedSearch.advancedSearch(items, query);
    const resultRows = new Set(results.map(r => r._row));

    // Show/hide rows
    this.originalRows.forEach(row => {
      row.style.display = resultRows.has(row) ? '' : 'none';
    });

    // Highlight matches
    if (results.length > 0) {
      this.highlightResults(query);
    }
  }

  highlightResults(query) {
    const cells = this.table.querySelectorAll('tbody td');
    cells.forEach(cell => {
      const original = cell.dataset.originalText || cell.textContent;
      cell.dataset.originalText = original;
      cell.innerHTML = this.advancedSearch.highlight(original, query);
    });
  }
}

// Export
if (typeof window !== 'undefined') {
  window.AdvancedSearch = AdvancedSearch;
  window.TableSearch = TableSearch;
}
