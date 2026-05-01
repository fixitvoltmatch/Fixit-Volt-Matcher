const CONFIG = {
  ORCHESTRATOR_URL: 'https://fixit-volt-matcher-fixit-orchestrator.hf.space'
};

// Shared runtime configuration and browser-only utilities.
// The frontend talks only to the orchestrator; internal service tokens never belong here.
window.CONFIG = CONFIG;

// Apply the persisted theme before the rest of the UI initializes to avoid a flash.

(function applyInitialTheme() {
  let savedTheme = '';

  try {
    savedTheme = localStorage.getItem('fixitTheme') || '';
  } catch (error) {
    savedTheme = '';
  }

  const theme = savedTheme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();

// Session accessors
function getToken() {
  return localStorage.getItem('accessToken') || '';
}

function getUserId() {
  return localStorage.getItem('userId') || '';
}

function getRole() {
  return localStorage.getItem('role') || '';
}

function getAuthHeaders() {
  return {
    Authorization: 'Bearer ' + getToken(),
    'Content-Type': 'application/json'
  };
}

function getPublicHeaders() {
  return {
    'Content-Type': 'application/json'
  };
}

function isLoggedIn() {
  return Boolean(getToken());
}

function logout() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// Theme management
function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function setTheme(theme) {
  const safeTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', safeTheme);

  try {
    localStorage.setItem('fixitTheme', safeTheme);
  } catch (error) {
    // Theme still applies for the current page even if storage is blocked.
  }

  updateThemeToggle();
}

function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

function getThemeIcon(theme) {
  if (theme === 'light') {
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }

  return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 14.2A8.2 8.2 0 0 1 9.8 3.5a8.8 8.8 0 1 0 10.7 10.7Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
}

function updateThemeToggle() {
  const button = document.querySelector('.theme-toggle-btn');

  if (!button) {
    return;
  }

  const theme = getTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  button.setAttribute('aria-label', 'Switch to ' + nextTheme + ' mode');
  button.setAttribute('title', 'Switch to ' + nextTheme + ' mode');
  button.innerHTML = getThemeIcon(theme) + '<span class="theme-toggle-label">' + (theme === 'dark' ? 'Dark' : 'Light') + '</span>';
}

function initThemeToggle() {
  if (document.querySelector('.theme-toggle-btn')) {
    updateThemeToggle();
    return;
  }

  const button = document.createElement('button');
  const navTarget = document.querySelector('.navbar-right') || document.querySelector('.nav-actions');
  const chatTarget = document.querySelector('.chat-header');

  button.className = 'theme-toggle-btn';
  button.type = 'button';
  button.addEventListener('click', toggleTheme);

  if (navTarget) {
    navTarget.insertBefore(button, navTarget.firstChild);
  } else if (chatTarget) {
    chatTarget.appendChild(button);
  } else {
    return;
  }

  updateThemeToggle();
}

function sanitizeMobileMenuClone(clone) {
  clone.querySelectorAll('.theme-toggle-btn').forEach((button) => button.remove());

  clone.querySelectorAll('[id]').forEach((element) => {
    const sourceId = element.id;
    element.dataset.mobileSourceId = sourceId;
    element.id = sourceId + 'Mobile';
  });

  clone.querySelectorAll('label[for]').forEach((label) => {
    label.setAttribute('for', label.getAttribute('for') + 'Mobile');
  });
}

function populateMobileMenu(container) {
  const menu = container.querySelector('.mobile-menu');

  if (!menu || menu.children.length > 0) {
    return;
  }

  const sources = Array.from(container.querySelectorAll('.navbar-inner > .tab-nav, .navbar-inner > .nav-actions, .navbar-inner > .navbar-right'));

  sources.forEach((source) => {
    const clone = source.cloneNode(true);
    sanitizeMobileMenuClone(clone);

    if (clone.children.length > 0) {
      menu.appendChild(clone);
    }
  });
}

function setMobileMenuOpen(container, isOpen) {
  const toggle = container.querySelector('.mobile-menu-toggle');
  const menu = container.querySelector('.mobile-menu');

  if (!toggle || !menu) {
    return;
  }

  container.classList.toggle('is-menu-open', isOpen);
  toggle.setAttribute('aria-expanded', String(isOpen));
  menu.setAttribute('aria-hidden', String(!isOpen));
}

function initMobileNav() {
  const containers = Array.from(document.querySelectorAll('.navbar, .chat-header'));

  containers.forEach((container) => {
    const toggle = container.querySelector('.mobile-menu-toggle');
    const menu = container.querySelector('.mobile-menu');

    if (!toggle || !menu) {
      return;
    }

    populateMobileMenu(container);
    setMobileMenuOpen(container, false);

    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      setMobileMenuOpen(container, !container.classList.contains('is-menu-open'));
    });

    menu.addEventListener('click', (event) => {
      const target = event.target.closest('a, button');

      if (!target) {
        return;
      }

      if (target.dataset.mobileSourceId === 'logoutBtn') {
        logout();
        return;
      }

      if (target.dataset.mobileSourceId === 'backBtn' || target.dataset.mobileBack === 'true') {
        const backButton = document.getElementById('backBtn');
        if (backButton) {
          backButton.click();
        }
      }

      setMobileMenuOpen(container, false);
    });
  });

  document.addEventListener('click', (event) => {
    containers.forEach((container) => {
      if (!container.contains(event.target)) {
        setMobileMenuOpen(container, false);
      }
    });
  });
}

// Route guards
function redirectIfNotLoggedIn() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
  }
}

function redirectBasedOnRole() {
  const role = getRole();

  if (role === 'customer') {
    window.location.href = 'customer.html';
    return;
  }

  if (role === 'electrician') {
    window.location.href = 'electrician.html';
    return;
  }

  window.location.href = 'login.html';
}

// User feedback primitives
const COLD_START_MESSAGE = 'Waking up our servers, please wait up to 30 seconds...';
let activeLoaderCount = 0;
let sessionExpiryStarted = false;

function getToastContainer() {
  let container = document.querySelector('.toast-container');

  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  return container;
}

function showToast(message, type = 'success') {
  const container = getToastContainer();
  const toast = document.createElement('div');
  const safeType = type === 'error' ? 'error' : 'success';

  toast.className = 'toast toast-' + safeType;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('toast-hide');
    window.setTimeout(() => {
      toast.remove();
    }, 250);
  }, 3000);
}

function showSpinner(message = 'Loading...') {
  let overlay = document.querySelector('.loading-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = [
      '<div class="loading-panel">',
      '  <div class="spinner" aria-hidden="true"></div>',
      '  <p class="loading-message"></p>',
      '  <div class="loading-progress" aria-hidden="true"><span></span></div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
  }

  const messageEl = overlay.querySelector('.loading-message');
  if (messageEl) {
    messageEl.textContent = message;
  }

  if (activeLoaderCount <= 1) {
    overlay.classList.remove('is-cold-start');
  }
  overlay.classList.add('is-visible');
}

function hideSpinner() {
  const overlay = document.querySelector('.loading-overlay');

  if (overlay) {
    overlay.classList.remove('is-visible');
    overlay.classList.remove('is-cold-start');
  }
}

function beginApiFeedback(message = 'Loading...') {
  activeLoaderCount += 1;
  showSpinner(message);

  const token = {
    timer: window.setTimeout(() => {
      const overlay = document.querySelector('.loading-overlay');
      const messageEl = overlay ? overlay.querySelector('.loading-message') : null;

      if (messageEl) {
        messageEl.textContent = COLD_START_MESSAGE;
      }

      if (overlay) {
        overlay.classList.add('is-cold-start');
      }
    }, 3000)
  };

  return token;
}

function endApiFeedback(token) {
  if (token && token.timer) {
    window.clearTimeout(token.timer);
  }

  activeLoaderCount = Math.max(0, activeLoaderCount - 1);

  if (activeLoaderCount === 0) {
    hideSpinner();
  }
}

// API response normalization
async function parseApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      return {};
    }
  }

  const text = await response.text();
  return text ? { message: text } : {};
}

function getSafeErrorMessage(responseBody, fallback = 'Something went wrong. Please try again.') {
  if (responseBody && typeof responseBody.error === 'string' && responseBody.error.trim()) {
    return responseBody.error;
  }

  if (responseBody && typeof responseBody.message === 'string' && responseBody.message.trim()) {
    return responseBody.message;
  }

  return fallback;
}

function apiUrl(path) {
  return CONFIG.ORCHESTRATOR_URL.replace(/\/$/, '') + path;
}

function createApiError(response, responseBody) {
  const error = new Error('API request failed');
  error.status = response.status;

  if (response.status === 401) {
    error.userMessage = 'Session expired';
  } else if (response.status >= 500) {
    error.userMessage = 'Something went wrong. Please try again';
  } else {
    error.userMessage = getSafeErrorMessage(responseBody);
  }

  return error;
}

function normalizeNetworkError(error) {
  if (error && error.status) {
    return error;
  }

  const apiError = new Error('Network request failed');
  apiError.isNetworkError = true;
  apiError.userMessage = 'Connection problem. Check your internet';
  return apiError;
}

function handleSessionExpired() {
  if (sessionExpiryStarted) {
    return;
  }

  sessionExpiryStarted = true;
  localStorage.clear();
  showToast('Session expired', 'error');
  window.setTimeout(() => {
    window.location.href = 'login.html';
  }, 2000);
}

function showRequestError(error) {
  if (error && error.status === 401) {
    handleSessionExpired();
    return;
  }

  showToast((error && error.userMessage) || 'Something went wrong. Please try again', 'error');
}

async function requestApi(path, options = {}, loadingMessage = 'Loading...', settings = {}) {
  const token = settings.silent ? null : beginApiFeedback(loadingMessage);

  try {
    const response = await fetch(apiUrl(path), options);
    const data = await parseApiResponse(response);

    if (!response.ok) {
      if (response.status === 401) {
        handleSessionExpired();
      }

      throw createApiError(response, data);
    }

    return data;
  } catch (error) {
    throw normalizeNetworkError(error);
  } finally {
    if (token) {
      endApiFeedback(token);
    }
  }
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }

  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }

    button.disabled = true;
    button.classList.add('is-loading');
    button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>' + escapeHtmlShared(loadingText || button.textContent.trim() || 'Loading') + '</span>';
    return;
  }

  button.disabled = false;
  button.classList.remove('is-loading');

  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function setFieldError(field, message) {
  if (!field) {
    return;
  }

  const group = field.closest('.form-group') || field.parentElement;
  let messageEl = group ? group.querySelector('.field-error-message[data-for="' + field.id + '"]') : null;

  field.classList.toggle('is-invalid', Boolean(message));
  field.setAttribute('aria-invalid', message ? 'true' : 'false');

  if (!message) {
    if (messageEl) {
      messageEl.remove();
    }
    return;
  }

  if (!messageEl && group) {
    messageEl = document.createElement('p');
    messageEl.className = 'field-error-message';
    messageEl.dataset.for = field.id;
    group.appendChild(messageEl);
  }

  if (messageEl) {
    messageEl.textContent = message;
  }
}

function clearFieldError(field) {
  setFieldError(field, '');
}

function validateRequiredField(field, message) {
  const isValid = Boolean(field && field.value.trim());
  setFieldError(field, isValid ? '' : message);
  return isValid;
}

function validateEmailField(field, requiredMessage = 'Email is required.') {
  if (!validateRequiredField(field, requiredMessage)) {
    return false;
  }

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim());
  setFieldError(field, isValid ? '' : 'Enter a valid email address.');
  return isValid;
}

function validatePasswordField(field) {
  if (!validateRequiredField(field, 'Password is required.')) {
    return false;
  }

  const isValid = field.value.length >= 8;
  setFieldError(field, isValid ? '' : 'Password must be at least 8 characters.');
  return isValid;
}

function validatePasswordMatchField(passwordField, confirmField) {
  if (!validateRequiredField(confirmField, 'Please confirm your password.')) {
    return false;
  }

  const isValid = passwordField.value === confirmField.value;
  setFieldError(confirmField, isValid ? '' : 'Passwords do not match.');
  return isValid;
}

function validatePhoneField(field) {
  if (!validateRequiredField(field, 'Phone is required.')) {
    return false;
  }

  const digitCount = field.value.replace(/\D/g, '').length;
  const isValid = digitCount >= 10;
  setFieldError(field, isValid ? '' : 'Phone must be at least 10 digits.');
  return isValid;
}

function clearFormErrors(form) {
  Array.from(form.querySelectorAll('.is-invalid')).forEach(clearFieldError);
}

function formatRelativeTime(value) {
  if (!value) {
    return 'Recently';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));

  if (seconds < 45) {
    return 'Just now';
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes + ' minute' + (minutes === 1 ? '' : 's') + ' ago';
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return days + ' day' + (days === 1 ? '' : 's') + ' ago';
  }

  const months = Math.round(days / 30);
  if (months < 12) {
    return months + ' month' + (months === 1 ? '' : 's') + ' ago';
  }

  const years = Math.round(months / 12);
  return years + ' year' + (years === 1 ? '' : 's') + ' ago';
}

function formatDateTime(value) {
  return formatRelativeTime(value);
}

function emptyState(title, message, variant = 'search') {
  const icons = {
    search: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8.5 11h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    jobs: '<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h6M8 17h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    chat: '<path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    match: '<path d="M13 2 4 14h7l-1 8 10-13h-7V2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };

  return [
    '<div class="card empty-state">',
    '  <div class="empty-illustration" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">' + (icons[variant] || icons.search) + '</svg></div>',
    '  <h3>' + escapeHtmlShared(title) + '</h3>',
    '  <p>' + escapeHtmlShared(message) + '</p>',
    '</div>'
  ].join('');
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return '0 KB';
  }

  if (bytes < 1024 * 1024) {
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtmlShared(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initPageFade() {
  document.body.classList.add('page-ready');
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileNav();
  initPageFade();
});

