# Form Best Practices - Preventing Value Loss Issues

## Root Cause
Browsers (especially Chrome/Edge) can clear form values between click and submit events due to:
- HTML5 validation interference
- Browser extensions (password managers, autofill)
- DOM manipulation during form submission
- Forced reflows triggering value resets

## Prevention Strategies

### 1. Always Use CRUDModal for CRUD Operations ✅
**DO:**
```javascript
window.CRUDModal.create('Add Item', fields, onSubmit, options);
window.CRUDModal.edit('Edit Item', fields, data, onSubmit, options);
```

**DON'T:**
```javascript
// Avoid custom form handling without value capture
form.addEventListener('submit', (e) => {
  const data = new FormData(form); // May get empty values!
});
```

### 2. Required Form Attributes
Always include on `<form>` elements:
```html
<form id="modalForm" novalidate autocomplete="off">
```

- `novalidate` - Disables browser HTML5 validation
- `autocomplete="off"` - Prevents browser/extension interference

### 3. For Custom Forms (Non-CRUDModal)
If you must create custom forms, implement value capture:

```javascript
const submitButton = form.querySelector('[type="submit"]');

// CAPTURE on click (before browser interference)
submitButton.addEventListener('click', (e) => {
  const formData = new FormData(form);
  const capturedData = {};
  
  // Capture from FormData
  for (const [key, value] of formData.entries()) {
    if (value) capturedData[key] = value;
  }
  
  // Backup: Direct DOM capture (important for selects)
  form.querySelectorAll('input, select, textarea').forEach(field => {
    if (field.name && field.value) {
      capturedData[field.name] = field.value;
    }
  });
  
  e.target.dataset.clickValues = JSON.stringify(capturedData);
});

// RESTORE on submit (after browser clearing)
form.addEventListener('submit', (e) => {
  e.preventDefault();
  e.stopImmediatePropagation();
  
  if (submitButton?.dataset.clickValues) {
    const captured = JSON.parse(submitButton.dataset.clickValues);
    Object.keys(captured).forEach(fieldName => {
      const field = form.querySelector(`[name="${fieldName}"]`);
      if (field) field.value = captured[fieldName];
    });
  }
  
  // Now collect data safely
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  handleSubmit(data);
});
```

### 4. Testing Checklist
Before deploying new forms:
- [ ] Test with all fields filled
- [ ] Test select dropdowns (don't just test text inputs)
- [ ] Test date/datetime inputs
- [ ] Test in different browsers (Chrome, Edge, Firefox)
- [ ] Test with browser extensions enabled/disabled
- [ ] Test both Add and Edit operations
- [ ] Check console for FormData contents

### 5. Code Review Standards
When reviewing form code:
- ✅ Uses `CRUDModal.create()` or `CRUDModal.edit()`
- ✅ Form has `novalidate autocomplete="off"`
- ✅ Submit button exists (`type="submit"`)
- ✅ Event has `e.preventDefault()` and `e.stopImmediatePropagation()`
- ✅ Value capture/restore if custom implementation
- ❌ Direct FormData collection without value capture
- ❌ Multiple submit handlers on same form

### 6. Dashboard Filter Pattern
For filter modals that need Apply button:

```javascript
window.openModal({
  title: 'Filter Data',
  bodyHtml: `
    <div class="form-grid">
      <!-- Filter inputs here -->
    </div>
    <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
      <button type="button" class="btn btn-secondary" data-reset-filters>Reset</button>
      <button type="submit" class="btn btn-primary">Apply Filters</button>
    </div>
  `,
  context: { entity: 'yourEntity', action: 'filter' }
});

// Handle submission
document.addEventListener('modalSubmit', (e) => {
  const { data, context } = e.detail;
  if (context.entity === 'yourEntity' && context.action === 'filter') {
    e.preventDefault();
    applyFilters(data);
  }
});
```

### 7. Common Mistakes to Avoid
1. **Missing submit button** - Filters/forms won't work without `<button type="submit">`
2. **Checking `!field.value` before restore** - Select dropdowns have default values, always restore
3. **Not capturing from DOM directly** - FormData might miss some select values
4. **Adding multiple submit listeners** - Use `stopImmediatePropagation()`
5. **Forgetting `novalidate`** - Browser validation can clear invalid values

### 8. Future Improvements
Consider implementing:
- Form state persistence (localStorage)
- Automatic form recovery on errors
- Field-level auto-save for long forms
- Visual indicators for unsaved changes
- Standardized form component library

## Quick Reference

### Symptoms of Value Loss:
- "This field is required" errors despite filling fields
- Select dropdowns reset to first option
- Date inputs show filled but validate as empty
- Values correct during typing but empty on submit

### Solution Checklist:
1. Use `CRUDModal.create()` or `CRUDModal.edit()`
2. Add `novalidate autocomplete="off"` to form
3. Ensure submit button exists
4. Value capture on click, restore on submit
5. Test in multiple browsers

## Files Modified for Fix
- `public/js/crud-modal.js` - Added value capture/restore to create() and edit()
- `public/tours-dashboard.html` - Added novalidate and autocomplete attributes
- `public/js/tours-dashboard.js` - Added Apply Filters button

## Contact
If similar issues occur, check console logs for:
- Empty FormData entries
- "Forced reflow" warnings
- Browser extension interference messages
