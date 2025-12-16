// ============================================
// MULTI-LANGUAGE SUPPORT MODULE (i18n)
// Internationalization for the application
// ============================================

class I18n {
  constructor() {
    this.currentLocale = 'id'; // Default to Indonesian
    this.translations = {};
    this.storageKey = 'app_locale';
    
    this.loadLocale();
    this.initTranslations();
  }
  
  initTranslations() {
    // Indonesian (Default)
    this.translations['id'] = {
      // Common
      'app.name': 'TravelOps Pro',
      'app.dashboard': 'Dashboard',
      'common.save': 'Simpan',
      'common.cancel': 'Batal',
      'common.delete': 'Hapus',
      'common.edit': 'Edit',
      'common.add': 'Tambah',
      'common.search': 'Cari',
      'common.filter': 'Filter',
      'common.export': 'Export',
      'common.import': 'Import',
      'common.loading': 'Memuat...',
      'common.noData': 'Tidak ada data',
      'common.success': 'Berhasil',
      'common.error': 'Error',
      'common.confirm': 'Konfirmasi',
      'common.yes': 'Ya',
      'common.no': 'Tidak',
      'common.close': 'Tutup',
      'common.view': 'Lihat',
      'common.details': 'Detail',
      'common.actions': 'Aksi',
      'common.status': 'Status',
      'common.date': 'Tanggal',
      'common.all': 'Semua',
      
      // Navigation
      'nav.home': 'Beranda',
      'nav.tours': 'Tur',
      'nav.sales': 'Penjualan',
      'nav.documents': 'Dokumen',
      'nav.reports': 'Laporan',
      'nav.settings': 'Pengaturan',
      'nav.logout': 'Keluar',
      'nav.profile': 'Profil',
      
      // Tours
      'tours.title': 'Manajemen Tur',
      'tours.addNew': 'Tambah Tur Baru',
      'tours.tourCode': 'Kode Tur',
      'tours.bookingCode': 'Kode Booking',
      'tours.departureDate': 'Tanggal Keberangkatan',
      'tours.leadPassenger': 'Penumpang Utama',
      'tours.passengers': 'Jumlah Peserta',
      'tours.staff': 'Staff',
      'tours.destination': 'Destinasi',
      'tours.invoiceNumber': 'Nomor Invoice',
      'tours.status': 'Status',
      'tours.status.pending': 'Menunggu',
      'tours.status.confirmed': 'Terkonfirmasi',
      'tours.status.completed': 'Selesai',
      'tours.status.cancelled': 'Dibatalkan',
      'tours.totalSales': 'Total Penjualan',
      
      // Sales
      'sales.title': 'Manajemen Penjualan',
      'sales.addNew': 'Tambah Penjualan',
      'sales.salesName': 'Nama Sales',
      'sales.customerName': 'Nama Customer',
      'sales.amount': 'Nominal',
      'sales.transferDate': 'Tanggal Transfer',
      'sales.paymentMethod': 'Metode Pembayaran',
      'sales.region': 'Wilayah',
      
      // Documents
      'documents.title': 'Manajemen Dokumen',
      'documents.addNew': 'Tambah Dokumen',
      'documents.documentName': 'Nama Dokumen',
      'documents.documentType': 'Tipe Dokumen',
      'documents.issueDate': 'Tanggal Terbit',
      'documents.expiryDate': 'Tanggal Kadaluarsa',
      'documents.status.pending': 'Menunggu',
      'documents.status.approved': 'Disetujui',
      'documents.status.expired': 'Kadaluarsa',
      
      // Reports
      'reports.title': 'Laporan',
      'reports.salesReport': 'Laporan Penjualan',
      'reports.toursReport': 'Laporan Tur',
      'reports.staffPerformance': 'Performa Staff',
      'reports.monthlyReport': 'Laporan Bulanan',
      'reports.yearlyReport': 'Laporan Tahunan',
      
      // Dashboard
      'dashboard.welcome': 'Selamat Datang',
      'dashboard.overview': 'Ringkasan',
      'dashboard.recentActivity': 'Aktivitas Terbaru',
      'dashboard.upcomingTours': 'Tur Mendatang',
      'dashboard.totalSales': 'Total Penjualan',
      'dashboard.totalTours': 'Total Tur',
      'dashboard.totalPassengers': 'Total Penumpang',
      'dashboard.thisMonth': 'Bulan Ini',
      'dashboard.thisYear': 'Tahun Ini',
      
      // Auth
      'auth.login': 'Masuk',
      'auth.logout': 'Keluar',
      'auth.username': 'Username',
      'auth.password': 'Password',
      'auth.rememberMe': 'Ingat Saya',
      'auth.forgotPassword': 'Lupa Password?',
      'auth.loginFailed': 'Login gagal. Periksa username dan password.',
      
      // Messages
      'msg.saved': 'Data berhasil disimpan',
      'msg.deleted': 'Data berhasil dihapus',
      'msg.updated': 'Data berhasil diperbarui',
      'msg.error': 'Terjadi kesalahan',
      'msg.confirmDelete': 'Apakah Anda yakin ingin menghapus?',
      'msg.noResults': 'Tidak ada hasil ditemukan',
      
      // Time
      'time.today': 'Hari Ini',
      'time.yesterday': 'Kemarin',
      'time.thisWeek': 'Minggu Ini',
      'time.thisMonth': 'Bulan Ini',
      'time.thisYear': 'Tahun Ini',
      'time.daysAgo': '{n} hari lalu',
      'time.hoursAgo': '{n} jam lalu',
      'time.minutesAgo': '{n} menit lalu',
      'time.justNow': 'Baru saja'
    };
    
    // English
    this.translations['en'] = {
      // Common
      'app.name': 'TravelOps Pro',
      'app.dashboard': 'Dashboard',
      'common.save': 'Save',
      'common.cancel': 'Cancel',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.add': 'Add',
      'common.search': 'Search',
      'common.filter': 'Filter',
      'common.export': 'Export',
      'common.import': 'Import',
      'common.loading': 'Loading...',
      'common.noData': 'No data available',
      'common.success': 'Success',
      'common.error': 'Error',
      'common.confirm': 'Confirm',
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.close': 'Close',
      'common.view': 'View',
      'common.details': 'Details',
      'common.actions': 'Actions',
      'common.status': 'Status',
      'common.date': 'Date',
      'common.all': 'All',
      
      // Navigation
      'nav.home': 'Home',
      'nav.tours': 'Tours',
      'nav.sales': 'Sales',
      'nav.documents': 'Documents',
      'nav.reports': 'Reports',
      'nav.settings': 'Settings',
      'nav.logout': 'Logout',
      'nav.profile': 'Profile',
      
      // Tours
      'tours.title': 'Tour Management',
      'tours.addNew': 'Add New Tour',
      'tours.tourCode': 'Tour Code',
      'tours.bookingCode': 'Booking Code',
      'tours.departureDate': 'Departure Date',
      'tours.leadPassenger': 'Lead Passenger',
      'tours.passengers': 'Passengers',
      'tours.staff': 'Staff',
      'tours.destination': 'Destination',
      'tours.invoiceNumber': 'Invoice Number',
      'tours.status': 'Status',
      'tours.status.pending': 'Pending',
      'tours.status.confirmed': 'Confirmed',
      'tours.status.completed': 'Completed',
      'tours.status.cancelled': 'Cancelled',
      'tours.totalSales': 'Total Sales',
      
      // Sales
      'sales.title': 'Sales Management',
      'sales.addNew': 'Add Sale',
      'sales.salesName': 'Sales Name',
      'sales.customerName': 'Customer Name',
      'sales.amount': 'Amount',
      'sales.transferDate': 'Transfer Date',
      'sales.paymentMethod': 'Payment Method',
      'sales.region': 'Region',
      
      // Documents
      'documents.title': 'Document Management',
      'documents.addNew': 'Add Document',
      'documents.documentName': 'Document Name',
      'documents.documentType': 'Document Type',
      'documents.issueDate': 'Issue Date',
      'documents.expiryDate': 'Expiry Date',
      'documents.status.pending': 'Pending',
      'documents.status.approved': 'Approved',
      'documents.status.expired': 'Expired',
      
      // Reports
      'reports.title': 'Reports',
      'reports.salesReport': 'Sales Report',
      'reports.toursReport': 'Tours Report',
      'reports.staffPerformance': 'Staff Performance',
      'reports.monthlyReport': 'Monthly Report',
      'reports.yearlyReport': 'Yearly Report',
      
      // Dashboard
      'dashboard.welcome': 'Welcome',
      'dashboard.overview': 'Overview',
      'dashboard.recentActivity': 'Recent Activity',
      'dashboard.upcomingTours': 'Upcoming Tours',
      'dashboard.totalSales': 'Total Sales',
      'dashboard.totalTours': 'Total Tours',
      'dashboard.totalPassengers': 'Total Passengers',
      'dashboard.thisMonth': 'This Month',
      'dashboard.thisYear': 'This Year',
      
      // Auth
      'auth.login': 'Login',
      'auth.logout': 'Logout',
      'auth.username': 'Username',
      'auth.password': 'Password',
      'auth.rememberMe': 'Remember Me',
      'auth.forgotPassword': 'Forgot Password?',
      'auth.loginFailed': 'Login failed. Please check your credentials.',
      
      // Messages
      'msg.saved': 'Data saved successfully',
      'msg.deleted': 'Data deleted successfully',
      'msg.updated': 'Data updated successfully',
      'msg.error': 'An error occurred',
      'msg.confirmDelete': 'Are you sure you want to delete?',
      'msg.noResults': 'No results found',
      
      // Time
      'time.today': 'Today',
      'time.yesterday': 'Yesterday',
      'time.thisWeek': 'This Week',
      'time.thisMonth': 'This Month',
      'time.thisYear': 'This Year',
      'time.daysAgo': '{n} days ago',
      'time.hoursAgo': '{n} hours ago',
      'time.minutesAgo': '{n} minutes ago',
      'time.justNow': 'Just now'
    };
  }
  
  loadLocale() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved && this.translations[saved]) {
      this.currentLocale = saved;
    }
  }
  
  setLocale(locale) {
    if (this.translations[locale]) {
      this.currentLocale = locale;
      localStorage.setItem(this.storageKey, locale);
      this.applyTranslations();
      document.documentElement.lang = locale;
      
      // Dispatch event for components to react
      document.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale } }));
    }
  }
  
  getLocale() {
    return this.currentLocale;
  }
  
  getAvailableLocales() {
    return [
      { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
      { code: 'en', name: 'English', flag: '🇺🇸' }
    ];
  }
  
  // Translate a key
  t(key, params = {}) {
    const translations = this.translations[this.currentLocale] || this.translations['id'];
    let text = translations[key] || key;
    
    // Replace parameters like {n} with actual values
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
    });
    
    return text;
  }
  
  // Shorthand for t()
  _(key, params = {}) {
    return this.t(key, params);
  }
  
  // Apply translations to DOM elements with data-i18n attribute
  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = this.t(key);
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = this.t(key);
    });
    
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      el.title = this.t(key);
    });
  }
  
  // Format currency based on locale
  formatCurrency(amount, currency = 'IDR') {
    const localeMap = {
      'id': 'id-ID',
      'en': 'en-US'
    };
    
    return new Intl.NumberFormat(localeMap[this.currentLocale] || 'id-ID', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }
  
  // Format date based on locale
  formatDate(date, options = {}) {
    const localeMap = {
      'id': 'id-ID',
      'en': 'en-US'
    };
    
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    return new Date(date).toLocaleDateString(
      localeMap[this.currentLocale] || 'id-ID',
      { ...defaultOptions, ...options }
    );
  }
  
  // Format number based on locale
  formatNumber(number) {
    const localeMap = {
      'id': 'id-ID',
      'en': 'en-US'
    };
    
    return new Intl.NumberFormat(localeMap[this.currentLocale] || 'id-ID').format(number);
  }
  
  // Relative time formatting
  formatRelativeTime(date) {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return this.t('time.justNow');
    if (diffMins < 60) return this.t('time.minutesAgo', { n: diffMins });
    if (diffHours < 24) return this.t('time.hoursAgo', { n: diffHours });
    if (diffDays < 7) return this.t('time.daysAgo', { n: diffDays });
    
    return this.formatDate(date);
  }
  
  // Render language selector
  renderLanguageSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const locales = this.getAvailableLocales();
    const current = locales.find(l => l.code === this.currentLocale);
    
    container.innerHTML = `
      <div class="language-selector">
        <button class="language-btn" id="langToggle">
          <span>${current?.flag || '🌐'}</span>
          <span class="lang-name">${current?.name || 'Language'}</span>
          <span class="lang-arrow">▾</span>
        </button>
        <div class="language-dropdown" id="langDropdown">
          ${locales.map(l => `
            <button class="lang-option ${l.code === this.currentLocale ? 'active' : ''}" 
                    data-locale="${l.code}">
              <span>${l.flag}</span>
              <span>${l.name}</span>
              ${l.code === this.currentLocale ? '<span class="check">✓</span>' : ''}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    
    this.addSelectorStyles();
    
    // Bind events
    const toggle = document.getElementById('langToggle');
    const dropdown = document.getElementById('langDropdown');
    
    toggle?.addEventListener('click', () => {
      dropdown.classList.toggle('show');
    });
    
    document.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setLocale(btn.dataset.locale);
        this.renderLanguageSelector(containerId);
      });
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.language-selector')) {
        dropdown?.classList.remove('show');
      }
    });
  }
  
  addSelectorStyles() {
    if (document.getElementById('i18nStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'i18nStyles';
    style.textContent = `
      .language-selector {
        position: relative;
      }
      .language-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        background: var(--card, #fff);
        cursor: pointer;
        font-size: 14px;
      }
      .language-btn:hover {
        background: var(--bg-alt, #f9fafb);
      }
      .lang-arrow {
        font-size: 10px;
        color: var(--text-secondary);
      }
      .language-dropdown {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        background: var(--card, #fff);
        border: 1px solid var(--border-light, #e5e7eb);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        min-width: 180px;
        display: none;
        z-index: 100;
        overflow: hidden;
      }
      .language-dropdown.show {
        display: block;
      }
      .lang-option {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 12px 16px;
        border: none;
        background: none;
        cursor: pointer;
        text-align: left;
        font-size: 14px;
      }
      .lang-option:hover {
        background: var(--bg-alt, #f9fafb);
      }
      .lang-option.active {
        background: var(--primary-light, #eff6ff);
        color: var(--primary, #3b82f6);
      }
      .lang-option .check {
        margin-left: auto;
        color: var(--primary, #3b82f6);
      }
    `;
    document.head.appendChild(style);
  }
}

// Create global instance
window.i18n = new I18n();

// Shorthand global function
window.__ = function(key, params = {}) {
  return window.i18n.t(key, params);
};

// Auto-apply translations on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.i18n.applyTranslations();
});
