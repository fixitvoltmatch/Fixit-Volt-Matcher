const locationIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M12 21s7-5.1 7-11a7 7 0 0 0-14 0c0 5.9 7 11 7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/></svg>';
const sections = {
  available: document.getElementById('availableSection'),
  active: document.getElementById('activeSection')
};

let electricianProfile = null;
let pendingJobs = [];
let activeJobs = [];
let activeTab = 'available';

document.addEventListener('DOMContentLoaded', initElectricianDashboard);

// Bootstrapping owns role protection, event wiring, and initial dashboard hydration.
async function initElectricianDashboard() {
  redirectIfNotLoggedIn();

  if (getRole() !== 'electrician') {
    window.location.href = 'customer.html';
    return;
  }

  bindEvents();
  await loadElectricianProfile();
  await loadAvailableJobs();
  await loadActiveJobs();
}

function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout);
  getAvailabilityToggles().forEach((toggle) => {
    toggle.addEventListener('change', handleAvailabilityToggle);
  });
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (event) => {
    if (event.target.id === 'modalOverlay') {
      closeModal();
    }
  });

  Array.from(document.querySelectorAll('.tab-button')).forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
}

function setActiveTab(tab) {
  activeTab = tab in sections ? tab : 'available';

  Object.entries(sections).forEach(([key, section]) => {
    section.classList.toggle('hidden', key !== activeTab);
  });

  Array.from(document.querySelectorAll('.tab-button')).forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === activeTab);
  });

  if (activeTab === 'available') {
    loadAvailableJobs();
  }

  if (activeTab === 'active') {
    loadActiveJobs();
  }
}

async function requestJson(path, options, loadingMessage) {
  return requestApi(path, options, loadingMessage || 'Loading...');
}

function showRequestError(error) {
  if (error && error.status === 401) {
    handleSessionExpired();
    return;
  }

  showToast((error && error.userMessage) || 'Something went wrong. Please try again', 'error');
}

// Data loading is split by workflow so each tab can refresh independently.
async function loadElectricianProfile() {
  try {
    const data = await requestJson('/api/auth/me', {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading your profile...');

    electricianProfile = data.electrician || null;
    updateAvailabilityUI(electricianProfile ? electricianProfile.available !== false : false);
  } catch (error) {
    showRequestError(error);
  }
}

async function loadAvailableJobs() {
  try {
    const [pendingData, matchedData] = await Promise.all([
      requestJson('/api/jobs?status=pending', {
        method: 'GET',
        headers: getAuthHeaders()
      }, 'Loading available jobs...'),
      requestJson('/api/jobs?status=matched&electrician_id=' + encodeURIComponent(getUserId()), {
        method: 'GET',
        headers: getAuthHeaders()
      }, 'Loading matched jobs...')
    ]);

    const byId = new Map();
    normalizeArray(pendingData, 'jobs').concat(normalizeArray(matchedData, 'jobs')).forEach((job) => {
      byId.set(String(job.id), job);
    });

    pendingJobs = Array.from(byId.values());
    renderAvailableJobs();
  } catch (error) {
    pendingJobs = [];
    showRequestError(error);
    renderAvailableJobs();
  }
}

async function loadActiveJobs() {
  try {
    const data = await requestJson('/api/jobs?electrician_id=' + encodeURIComponent(getUserId()), {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading active jobs...');

    activeJobs = normalizeArray(data, 'jobs').filter((job) => {
      const status = normalizeStatus(job.status);
      return status === 'accepted' || status === 'completed';
    });
    renderActiveJobs();
  } catch (error) {
    activeJobs = [];
    showRequestError(error);
    renderActiveJobs();
  }
}

// Rendering keeps job cards consistent while preserving tab-specific actions.
function renderAvailableJobs() {
  const grid = document.getElementById('availableJobsGrid');

  if (!pendingJobs.length) {
    grid.innerHTML = emptyState('No available jobs right now', 'Pending and AI-matched jobs will appear here.', 'jobs');
    return;
  }

  grid.innerHTML = pendingJobs.map((job) => availableJobCardHtml(job)).join('');

  grid.querySelectorAll('[data-action="details"]').forEach((button) => {
    button.addEventListener('click', () => openJobDetailsModal(findPendingJob(button.dataset.id)));
  });
}

function renderActiveJobs() {
  const list = document.getElementById('activeJobsList');

  if (!activeJobs.length) {
    list.innerHTML = emptyState('No active jobs yet', 'Accepted jobs will appear here.', 'jobs');
    return;
  }

  list.innerHTML = activeJobs.map((job) => activeJobCardHtml(job)).join('');

  list.querySelectorAll('[data-action="chat"]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = 'chat.html?jobId=' + encodeURIComponent(button.dataset.id);
    });
  });

  list.querySelectorAll('[data-action="complete"]').forEach((button) => {
    button.addEventListener('click', () => markJobComplete(button.dataset.id, button));
  });
}

function availableJobCardHtml(job) {
  const severity = normalizeSeverity(job.ai_severity);

  return [
    '<article class="card job-card">',
    '  <h3 class="card-title">' + escapeHtml(job.title || 'Electrical job') + '</h3>',
    '  <div class="location-line">' + locationIcon + '<span>' + escapeHtml(job.city || 'City not listed') + '</span></div>',
    '  <div class="tag-list">',
    job.ai_issue_type ? '    <span class="badge badge-soft">' + escapeHtml(job.ai_issue_type) + '</span>' : '',
    job.ai_severity ? '    <span class="badge badge-severity-' + severity + '">' + escapeHtml(toTitleCase(severity)) + '</span>' : '',
    '  </div>',
    '  <p class="muted">' + escapeHtml(formatRelativeTime(job.created_at)) + '</p>',
    '  <p class="muted line-clamp">' + escapeHtml(job.ai_explanation || job.description || 'No AI explanation available yet.') + '</p>',
    '  <div class="tag-list">' + getSuggestedSkills(job).map(skillTagHtml).join('') + '</div>',
    '  <div class="card-actions">',
    '    <button class="btn-secondary" type="button" data-action="details" data-id="' + escapeHtml(job.id) + '">View Details</button>',
    '  </div>',
    '</article>'
  ].join('');
}

function activeJobCardHtml(job) {
  const status = normalizeStatus(job.status);
  const severity = normalizeSeverity(job.ai_severity);
  const chatButton = status === 'accepted'
    ? '<button class="btn-primary" type="button" data-action="chat" data-id="' + escapeHtml(job.id) + '">Open Chat</button>'
    : '';
  const completeButton = status === 'accepted'
    ? '<button class="btn-success" type="button" data-action="complete" data-id="' + escapeHtml(job.id) + '">Mark Complete</button>'
    : '';

  return [
    '<article class="card job-card">',
    '  <div>',
    '    <h3 class="card-title">' + escapeHtml(job.title || 'Electrical job') + '</h3>',
    '    <p class="muted">Customer city: ' + escapeHtml(job.city || 'Not listed') + '</p>',
    '  </div>',
    '  <div class="tag-list">',
    '    <span class="badge badge-status-' + status + '">' + escapeHtml(toTitleCase(status)) + '</span>',
    job.ai_issue_type ? '    <span class="badge badge-soft">' + escapeHtml(job.ai_issue_type) + '</span>' : '',
    job.ai_severity ? '    <span class="badge badge-severity-' + severity + '">' + escapeHtml(toTitleCase(severity)) + '</span>' : '',
    '  </div>',
    '  <p class="muted line-clamp">' + escapeHtml(job.ai_explanation || job.description || 'No AI summary available yet.') + '</p>',
    '  <div class="card-actions">',
    chatButton,
    completeButton,
    '  </div>',
    '</article>'
  ].join('');
}

// Job actions are the only functions that mutate job or availability state.
async function handleAvailabilityToggle(event) {
  const toggle = event.target;
  const nextAvailable = toggle.checked;
  getAvailabilityToggles().forEach((item) => {
    item.disabled = true;
  });

  try {
    await requestJson('/api/users/' + encodeURIComponent(getUserId()), {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ available: nextAvailable })
    }, 'Updating availability...');

    updateAvailabilityUI(nextAvailable);
    showToast(nextAvailable ? 'You are now available.' : 'You are now unavailable.', 'success');
  } catch (error) {
    updateAvailabilityUI(!nextAvailable);
    showRequestError(error);
  } finally {
    getAvailabilityToggles().forEach((item) => {
      item.disabled = false;
    });
  }
}

async function acceptJob(jobId, button) {
  setButtonLoading(button, true, 'Accepting');

  try {
    await requestJson('/api/jobs/' + encodeURIComponent(jobId) + '/status', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        status: 'accepted',
        electrician_id: getUserId()
      })
    }, 'Accepting job...');

    showToast('Job accepted!', 'success');
    closeModal();
    await loadAvailableJobs();
    await loadActiveJobs();
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(button, false);
  }
}

async function rejectJob(jobId, button) {
  setButtonLoading(button, true, 'Rejecting');

  try {
    await requestJson('/api/jobs/' + encodeURIComponent(jobId) + '/status', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: 'rejected' })
    }, 'Rejecting job...');

    showToast('Job rejected.', 'success');
    closeModal();
    pendingJobs = pendingJobs.filter((job) => String(job.id) !== String(jobId));
    renderAvailableJobs();
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(button, false);
  }
}

async function markJobComplete(jobId, button) {
  setButtonLoading(button, true, 'Completing');

  try {
    await requestJson('/api/jobs/' + encodeURIComponent(jobId) + '/complete', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({})
    }, 'Marking job complete...');

    showToast('Job marked complete!', 'success');
    activeJobs = activeJobs.map((job) => String(job.id) === String(jobId) ? { ...job, status: 'completed' } : job);
    renderActiveJobs();
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(button, false);
  }
}

function updateAvailabilityUI(isAvailable) {
  getAvailabilityToggles().forEach((toggle) => {
    toggle.checked = Boolean(isAvailable);
  });

  getAvailabilityLabels().forEach((label) => {
    label.textContent = isAvailable ? 'Available' : 'Unavailable';
  });
}

function getAvailabilityToggles() {
  return Array.from(document.querySelectorAll('#availabilityToggle, #availabilityToggleMobile'));
}

function getAvailabilityLabels() {
  return Array.from(document.querySelectorAll('#availabilityLabel, #availabilityLabelMobile'));
}

// Modal composition keeps high-detail job review separate from card rendering.
function openJobDetailsModal(job) {
  if (!job) {
    return;
  }

  const severity = normalizeSeverity(job.ai_severity);
  const imageHtml = job.image_url
    ? '<img class="job-image" src="' + escapeHtml(job.image_url) + '" alt="Uploaded electrical issue image">'
    : '';

  openModal([
    '<h2 id="modalTitle">' + escapeHtml(job.title || 'Job details') + '</h2>',
    '<div class="detail-list">',
    detailRow('Description', job.description || 'No description available.'),
    detailRow('Customer city', job.city || 'Not listed'),
    detailRow('Issue type', job.ai_issue_type || 'Not available'),
    detailRow('Severity', job.ai_severity ? '<span class="badge badge-severity-' + severity + '">' + escapeHtml(toTitleCase(severity)) + '</span>' : 'Not available', Boolean(job.ai_severity)),
    detailRow('AI explanation', job.ai_explanation || 'Not available'),
    detailRow('Suggested skills', '<div class="tag-list">' + getSuggestedSkills(job).map(skillTagHtml).join('') + '</div>', true),
    imageHtml ? detailRow('Image', imageHtml, true) : '',
    '</div>',
    '<div class="card-actions modal-action-row">',
    '  <button class="btn-success" type="button" id="acceptJobBtn">Accept Job</button>',
    '  <button class="btn-outline-danger" type="button" id="rejectJobBtn">Reject</button>',
    '</div>'
  ].join(''));

  document.getElementById('acceptJobBtn').addEventListener('click', (event) => acceptJob(job.id, event.currentTarget));
  document.getElementById('rejectJobBtn').addEventListener('click', (event) => rejectJob(job.id, event.currentTarget));
}

function openModal(html) {
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalContent').innerHTML = html;
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.getElementById('modalContent').innerHTML = '';
}

// Formatting helpers absorb backend edge cases and keep templates compact.
function normalizeArray(data, key) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data[key])) {
    return data[key];
  }

  return [];
}

function findPendingJob(id) {
  return pendingJobs.find((job) => String(job.id) === String(id));
}

function getSuggestedSkills(job) {
  return Array.isArray(job.ai_suggested_skills) ? job.ai_suggested_skills : [];
}

function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return ['pending', 'matched', 'accepted', 'rejected', 'completed'].includes(value) ? value : 'pending';
}

function normalizeSeverity(severity) {
  const value = String(severity || 'medium').toLowerCase();
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
}

function skillTagHtml(skill) {
  return '<span class="skill-tag">' + escapeHtml(toTitleCase(skill)) + '</span>';
}

function detailRow(label, value, valueIsHtml) {
  return '<div class="detail-row"><strong>' + escapeHtml(label) + '</strong><span>' + (valueIsHtml ? value : escapeHtml(value)) + '</span></div>';
}

function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


