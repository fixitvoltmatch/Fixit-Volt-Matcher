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
      '</div>'
    ].join('');
    document.body.appendChild(overlay);
  }

  const messageEl = overlay.querySelector('.loading-message');
  if (messageEl) {
    messageEl.textContent = message;
  }

  overlay.classList.add('is-visible');
}

function hideSpinner() {
  const overlay = document.querySelector('.loading-overlay');

  if (overlay) {
    overlay.classList.remove('is-visible');
  }
}

// API response normalization
async function parseApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
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

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

document.addEventListener('DOMContentLoaded', initThemeToggle);

