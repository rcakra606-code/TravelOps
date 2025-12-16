// ============================================
// AUDIT TRAIL MODULE
// Track who changed what, with version history
// ============================================

class AuditTrail {
  constructor() {
    this.logs = [];
    this.storageKey = 'audit_trail_logs';
    this.maxLogs = 500;
  }
  
  // Log an action
  log(action, module, recordId, changes, userId = null) {
    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      action, // create, update, delete, view, export, import
      module, // tours, sales, documents, users, etc
      recordId,
      changes, // { field: { old: 'value', new: 'value' } }
      userId: userId || this.getCurrentUserId(),
      userName: this.getCurrentUserName(),
      userRole: this.getCurrentUserRole(),
      sessionId: this.getSessionId(),
      ipAddress: null, // Would need backend support
      userAgent: navigator.userAgent
    };
    
    this.logs.unshift(entry);
    
    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
    
    this.save();
    
    // Also send to server if available
    this.sendToServer(entry);
    
    return entry;
  }
  
  generateId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getCurrentUserId() {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id || payload.userId || 'unknown';
      }
    } catch (e) {}
    return 'unknown';
  }
  
  getCurrentUserName() {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.username || payload.name || 'Unknown User';
      }
    } catch (e) {}
    return localStorage.getItem('username') || 'Unknown User';
  }
  
  getCurrentUserRole() {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.role || 'user';
      }
    } catch (e) {}
    return 'user';
  }
  
  getSessionId() {
    let sessionId = sessionStorage.getItem('audit_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('audit_session_id', sessionId);
    }
    return sessionId;
  }
  
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (e) {
      console.warn('Failed to save audit logs:', e);
    }
  }
  
  load() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        this.logs = JSON.parse(saved);
      }
    } catch (e) {
      this.logs = [];
    }
  }
  
  async sendToServer(entry) {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/audit-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(entry)
      });
    } catch (e) {
      // Server logging is optional, don't fail silently
    }
  }
  
  // Get logs with filters
  getLogs(filters = {}) {
    this.load();
    
    let results = [...this.logs];
    
    if (filters.module) {
      results = results.filter(l => l.module === filters.module);
    }
    
    if (filters.action) {
      results = results.filter(l => l.action === filters.action);
    }
    
    if (filters.userId) {
      results = results.filter(l => l.userId === filters.userId);
    }
    
    if (filters.recordId) {
      results = results.filter(l => l.recordId === filters.recordId);
    }
    
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter(l => new Date(l.timestamp) >= start);
    }
    
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter(l => new Date(l.timestamp) <= end);
    }
    
    if (filters.search) {
      const search = filters.search.toLowerCase();
      results = results.filter(l => 
        l.userName?.toLowerCase().includes(search) ||
        l.module?.toLowerCase().includes(search) ||
        l.action?.toLowerCase().includes(search) ||
        JSON.stringify(l.changes).toLowerCase().includes(search)
      );
    }
    
    return results;
  }
  
  // Get history for a specific record
  getRecordHistory(module, recordId) {
    return this.getLogs({ module, recordId });
  }
  
  // Get user activity
  getUserActivity(userId) {
    return this.getLogs({ userId });
  }
  
  // Format changes for display
  formatChanges(changes) {
    if (!changes || typeof changes !== 'object') return 'No details';
    
    const lines = [];
    for (const [field, change] of Object.entries(changes)) {
      if (change && typeof change === 'object' && ('old' in change || 'new' in change)) {
        lines.push(`${field}: "${change.old || '-'}" → "${change.new || '-'}"`);
      } else {
        lines.push(`${field}: ${JSON.stringify(change)}`);
      }
    }
    return lines.join('\n');
  }
  
  // Render audit trail viewer
  renderViewer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    this.load();
    
    container.innerHTML = `
      <div class="audit-viewer">
        <div class="audit-header">
          <h3>🔍 Audit Trail</h3>
          <div class="audit-filters">
            <input type="text" id="auditSearch" placeholder="Search..." class="audit-input">
            <select id="auditModule" class="audit-select">
              <option value="">All Modules</option>
              <option value="tours">Tours</option>
              <option value="sales">Sales</option>
              <option value="documents">Documents</option>
              <option value="users">Users</option>
            </select>
            <select id="auditAction" class="audit-select">
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="view">View</option>
              <option value="export">Export</option>
            </select>
            <input type="date" id="auditStartDate" class="audit-input" placeholder="Start Date">
            <input type="date" id="auditEndDate" class="audit-input" placeholder="End Date">
            <button id="auditExport" class="audit-btn">📥 Export</button>
          </div>
        </div>
        
        <div class="audit-stats" id="auditStats"></div>
        
        <div class="audit-list" id="auditList">
          ${this.renderLogsList()}
        </div>
      </div>
    `;
    
    this.addStyles();
    this.bindViewerEvents(containerId);
    this.updateStats();
  }
  
  renderLogsList(filters = {}) {
    const logs = this.getLogs(filters).slice(0, 100);
    
    if (logs.length === 0) {
      return '<div class="audit-empty">No audit logs found</div>';
    }
    
    return logs.map(log => `
      <div class="audit-item">
        <div class="audit-icon ${log.action}">${this.getActionIcon(log.action)}</div>
        <div class="audit-content">
          <div class="audit-title">
            <span class="audit-user">${log.userName}</span>
            <span class="audit-action-badge ${log.action}">${log.action}</span>
            <span class="audit-module">${log.module}</span>
            ${log.recordId ? `<span class="audit-record">#${log.recordId}</span>` : ''}
          </div>
          <div class="audit-changes">${this.formatChangesPreview(log.changes)}</div>
          <div class="audit-meta">
            <span class="audit-time">${this.formatTime(log.timestamp)}</span>
            <span class="audit-session" title="Session: ${log.sessionId}">🔗</span>
          </div>
        </div>
        <button class="audit-details-btn" data-log-id="${log.id}" title="View details">›</button>
      </div>
    `).join('');
  }
  
  formatChangesPreview(changes) {
    if (!changes || typeof changes !== 'object') return '';
    
    const fields = Object.keys(changes).slice(0, 3);
    if (fields.length === 0) return '';
    
    const preview = fields.map(f => `<span class="change-field">${f}</span>`).join(', ');
    const more = Object.keys(changes).length > 3 ? ` +${Object.keys(changes).length - 3} more` : '';
    
    return `Changed: ${preview}${more}`;
  }
  
  getActionIcon(action) {
    const icons = {
      create: '➕',
      update: '✏️',
      delete: '🗑️',
      view: '👁️',
      export: '📤',
      import: '📥',
      login: '🔐',
      logout: '🚪'
    };
    return icons[action] || '📝';
  }
  
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }
  
  updateStats() {
    const stats = document.getElementById('auditStats');
    if (!stats) return;
    
    const logs = this.getLogs({});
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogs = logs.filter(l => new Date(l.timestamp) >= today);
    const creates = logs.filter(l => l.action === 'create').length;
    const updates = logs.filter(l => l.action === 'update').length;
    const deletes = logs.filter(l => l.action === 'delete').length;
    
    stats.innerHTML = `
      <div class="audit-stat">
        <span class="stat-value">${todayLogs.length}</span>
        <span class="stat-label">Today</span>
      </div>
      <div class="audit-stat">
        <span class="stat-value">${logs.length}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="audit-stat create">
        <span class="stat-value">${creates}</span>
        <span class="stat-label">Creates</span>
      </div>
      <div class="audit-stat update">
        <span class="stat-value">${updates}</span>
        <span class="stat-label">Updates</span>
      </div>
      <div class="audit-stat delete">
        <span class="stat-value">${deletes}</span>
        <span class="stat-label">Deletes</span>
      </div>
    `;
  }
  
  bindViewerEvents(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const applyFilters = () => {
      const filters = {
        search: document.getElementById('auditSearch')?.value,
        module: document.getElementById('auditModule')?.value,
        action: document.getElementById('auditAction')?.value,
        startDate: document.getElementById('auditStartDate')?.value,
        endDate: document.getElementById('auditEndDate')?.value
      };
      
      document.getElementById('auditList').innerHTML = this.renderLogsList(filters);
    };
    
    document.getElementById('auditSearch')?.addEventListener('input', applyFilters);
    document.getElementById('auditModule')?.addEventListener('change', applyFilters);
    document.getElementById('auditAction')?.addEventListener('change', applyFilters);
    document.getElementById('auditStartDate')?.addEventListener('change', applyFilters);
    document.getElementById('auditEndDate')?.addEventListener('change', applyFilters);
    
    document.getElementById('auditExport')?.addEventListener('click', () => {
      this.exportLogs();
    });
    
    // Details buttons
    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('audit-details-btn')) {
        const logId = e.target.dataset.logId;
        this.showLogDetails(logId);
      }
    });
  }
  
  showLogDetails(logId) {
    const log = this.logs.find(l => l.id === logId);
    if (!log) return;
    
    const modal = document.createElement('div');
    modal.className = 'audit-detail-modal';
    modal.innerHTML = `
      <div class="audit-detail-overlay"></div>
      <div class="audit-detail-content">
        <h3>${this.getActionIcon(log.action)} Audit Log Details</h3>
        <div class="audit-detail-grid">
          <div class="detail-row">
            <span class="detail-label">ID</span>
            <span class="detail-value">${log.id}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Time</span>
            <span class="detail-value">${new Date(log.timestamp).toLocaleString()}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">User</span>
            <span class="detail-value">${log.userName} (${log.userRole})</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Action</span>
            <span class="detail-value"><span class="audit-action-badge ${log.action}">${log.action}</span></span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Module</span>
            <span class="detail-value">${log.module}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Record ID</span>
            <span class="detail-value">${log.recordId || '-'}</span>
          </div>
          <div class="detail-row full">
            <span class="detail-label">Changes</span>
            <pre class="detail-changes">${this.formatChanges(log.changes)}</pre>
          </div>
          <div class="detail-row">
            <span class="detail-label">Session</span>
            <span class="detail-value">${log.sessionId}</span>
          </div>
        </div>
        <button class="audit-detail-close">Close</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.audit-detail-overlay').onclick = () => modal.remove();
    modal.querySelector('.audit-detail-close').onclick = () => modal.remove();
  }
  
  exportLogs() {
    const logs = this.getLogs({});
    const csv = [
      ['ID', 'Timestamp', 'User', 'Role', 'Action', 'Module', 'Record ID', 'Changes'].join(','),
      ...logs.map(l => [
        l.id,
        l.timestamp,
        `"${l.userName}"`,
        l.userRole,
        l.action,
        l.module,
        l.recordId || '',
        `"${this.formatChanges(l.changes).replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  addStyles() {
    if (document.getElementById('auditTrailStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'auditTrailStyles';
    style.textContent = `
      .audit-viewer {
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      .audit-header {
        margin-bottom: 20px;
      }
      .audit-header h3 {
        margin: 0 0 16px 0;
        font-size: 18px;
      }
      .audit-filters {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .audit-input, .audit-select {
        padding: 8px 12px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        font-size: 13px;
        background: var(--bg-alt, #fff);
      }
      .audit-input:focus, .audit-select:focus {
        outline: none;
        border-color: var(--primary, #3b82f6);
      }
      .audit-btn {
        padding: 8px 16px;
        border: none;
        background: var(--primary, #3b82f6);
        color: white;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
      }
      .audit-stats {
        display: flex;
        gap: 16px;
        margin-bottom: 20px;
        padding: 16px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 12px;
      }
      .audit-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 8px 16px;
      }
      .audit-stat .stat-value { font-size: 20px; font-weight: 700; }
      .audit-stat .stat-label { font-size: 12px; color: var(--text-secondary); }
      .audit-stat.create .stat-value { color: #10b981; }
      .audit-stat.update .stat-value { color: #3b82f6; }
      .audit-stat.delete .stat-value { color: #ef4444; }
      .audit-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 500px;
        overflow-y: auto;
      }
      .audit-empty {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary);
      }
      .audit-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--bg-alt, #f9fafb);
        border-radius: 10px;
        transition: background 0.2s;
      }
      .audit-item:hover {
        background: var(--border-light, #e5e7eb);
      }
      .audit-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      }
      .audit-icon.create { background: #d1fae5; }
      .audit-icon.update { background: #dbeafe; }
      .audit-icon.delete { background: #fee2e2; }
      .audit-icon.view { background: #f3f4f6; }
      .audit-icon.export { background: #e0e7ff; }
      .audit-content { flex: 1; }
      .audit-title { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
      .audit-user { font-weight: 600; font-size: 14px; }
      .audit-action-badge {
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
      }
      .audit-action-badge.create { background: #d1fae5; color: #059669; }
      .audit-action-badge.update { background: #dbeafe; color: #2563eb; }
      .audit-action-badge.delete { background: #fee2e2; color: #dc2626; }
      .audit-action-badge.view { background: #f3f4f6; color: #6b7280; }
      .audit-module { color: var(--text-secondary); font-size: 13px; }
      .audit-record { color: var(--primary, #3b82f6); font-size: 13px; }
      .audit-changes { font-size: 12px; color: var(--text-secondary); }
      .change-field { background: var(--border-light, #e5e7eb); padding: 1px 6px; border-radius: 4px; }
      .audit-meta { display: flex; gap: 8px; font-size: 12px; color: var(--text-secondary); }
      .audit-details-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: none;
        font-size: 20px;
        cursor: pointer;
        color: var(--text-secondary);
        border-radius: 6px;
      }
      .audit-details-btn:hover {
        background: var(--border-light, #e5e7eb);
      }
      
      /* Detail modal */
      .audit-detail-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .audit-detail-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.5);
      }
      .audit-detail-content {
        position: relative;
        background: var(--card, #fff);
        border-radius: 16px;
        padding: 24px;
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow-y: auto;
      }
      .audit-detail-content h3 {
        margin: 0 0 20px 0;
      }
      .audit-detail-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 20px;
      }
      .detail-row {
        display: flex;
        gap: 12px;
      }
      .detail-row.full {
        flex-direction: column;
      }
      .detail-label {
        width: 100px;
        font-size: 13px;
        color: var(--text-secondary);
        flex-shrink: 0;
      }
      .detail-value {
        font-size: 14px;
        word-break: break-all;
      }
      .detail-changes {
        background: var(--bg-alt, #f9fafb);
        padding: 12px;
        border-radius: 8px;
        font-size: 12px;
        white-space: pre-wrap;
        margin: 0;
      }
      .audit-detail-close {
        width: 100%;
        padding: 12px;
        border: none;
        background: var(--bg-alt, #f3f4f6);
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }
}

// Global instance
window.auditTrail = new AuditTrail();
window.AuditTrail = AuditTrail;

// Helper function to easily log actions
window.logAudit = function(action, module, recordId, changes) {
  return window.auditTrail.log(action, module, recordId, changes);
};
