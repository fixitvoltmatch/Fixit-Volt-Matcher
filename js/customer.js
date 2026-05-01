const ALL_SKILLS = ['wiring', 'switches', 'panels', 'lighting', 'breakers', 'fans', 'appliances', 'safety inspection'];
const locationIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M12 21s7-5.1 7-11a7 7 0 0 0-14 0c0 5.9 7 11 7 11Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/></svg>';

const sections = {
  find: document.getElementById('findSection'),
  post: document.getElementById('postSection'),
  jobs: document.getElementById('jobsSection')
};

let activeTab = 'find';
let customerProfile = null;
let electricianCache = [];
let customerJobs = [];
let lastCreatedJob = null;
let lastMatches = [];
let apiBusyCount = 0;

document.addEventListener('DOMContentLoaded', initCustomerDashboard);

// Bootstrapping owns route protection, event wiring, and initial dashboard hydration.
async function initCustomerDashboard() {
  redirectIfNotLoggedIn();

  if (getRole() !== 'customer') {
    window.location.href = 'electrician.html';
    return;
  }

  setupSkillFilter();
  bindEvents();
  await loadCustomerProfile();
  await loadElectricians();
  await loadJobs();
}

function bindEvents() {
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('searchElectriciansBtn').addEventListener('click', () => loadElectricians());
  document.getElementById('getAiMatchBtn').addEventListener('click', handleAiSmartMatch);
  document.getElementById('postManualJobBtn').addEventListener('click', handleManualJobPost);
  document.getElementById('browseElectriciansBtn').addEventListener('click', () => setActiveTab('find'));
  document.getElementById('jobImage').addEventListener('change', handleImagePreview);
  document.getElementById('aiFloatBtn').addEventListener('click', openAiFinderModal);
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

function setupSkillFilter() {
  const skillFilter = document.getElementById('skillFilter');
  ALL_SKILLS.forEach((skill) => {
    const option = document.createElement('option');
    option.value = skill;
    option.textContent = toTitleCase(skill);
    skillFilter.appendChild(option);
  });
}

function setActiveTab(tab) {
  activeTab = tab in sections ? tab : 'find';

  Object.entries(sections).forEach(([key, section]) => {
    section.classList.toggle('hidden', key !== activeTab);
  });

  Array.from(document.querySelectorAll('.tab-button')).forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tab === activeTab);
  });

  if (activeTab === 'find') {
    loadElectricians();
  }

  if (activeTab === 'jobs') {
    loadJobs();
  }
}

// API boundary: all protected requests go through the orchestrator with bearer auth.
function beginApi(message) {
  apiBusyCount += 1;
  showSpinner(message);
}

function endApi() {
  apiBusyCount = Math.max(0, apiBusyCount - 1);

  if (apiBusyCount === 0) {
    hideSpinner();
  }
}

async function requestJson(path, options, loadingMessage) {
  beginApi(loadingMessage || 'Loading...');

  try {
    const response = await fetch(apiUrl(path), options);
    const data = await parseApiResponse(response);

    if (!response.ok) {
      const error = new Error('API request failed');
      error.userMessage = getSafeErrorMessage(data);
      throw error;
    }

    return data;
  } finally {
    endApi();
  }
}

async function requestFormData(path, formData, loadingMessage) {
  beginApi(loadingMessage || 'Uploading...');

  try {
    const response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + getToken()
      },
      body: formData
    });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      const error = new Error('API request failed');
      error.userMessage = getSafeErrorMessage(data);
      throw error;
    }

    return data;
  } finally {
    endApi();
  }
}

function showRequestError(error) {
  showToast(error.userMessage || 'Something went wrong. Please try again.', 'error');
}

// Data loading keeps backend shape normalization close to the fetch that needs it.
async function loadCustomerProfile() {
  try {
    const data = await requestJson('/api/auth/me', {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading your profile...');

    customerProfile = data.user || null;

    if (customerProfile && customerProfile.city) {
      document.getElementById('jobCity').value = customerProfile.city;
      document.getElementById('cityFilter').value = customerProfile.city;
    }
  } catch (error) {
    showRequestError(error);
  }
}

async function loadElectricians() {
  const city = document.getElementById('cityFilter').value.trim();
  const skill = document.getElementById('skillFilter').value;
  const params = new URLSearchParams();

  if (city) {
    params.set('city', city);
  }

  if (skill) {
    params.set('skill', skill);
  }

  const path = '/api/electricians' + (params.toString() ? '?' + params.toString() : '');

  try {
    const data = await requestJson(path, {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading electricians...');

    electricianCache = normalizeArray(data, 'electricians');
    renderElectricians();
  } catch (error) {
    showRequestError(error);
    renderElectricians([]);
  }
}

async function loadJobs() {
  try {
    const data = await requestJson('/api/jobs?customer_id=' + encodeURIComponent(getUserId()), {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading your jobs...');

    customerJobs = normalizeArray(data, 'jobs');
    renderJobs();
  } catch (error) {
    showRequestError(error);
    renderJobs([]);
  }
}

// Rendering is intentionally pure-ish: cached state in, HTML/events out.
function renderElectricians() {
  const catalog = document.getElementById('electricianCatalog');
  const selectedSkill = document.getElementById('skillFilter').value;
  const filtered = selectedSkill
    ? electricianCache.filter((electrician) => getSkills(electrician).includes(selectedSkill))
    : electricianCache;

  if (!filtered.length) {
    catalog.innerHTML = emptyState('No electricians found', 'Try another city or skill filter.');
    return;
  }

  catalog.innerHTML = filtered.map((electrician) => electricianCardHtml(electrician)).join('');

  catalog.querySelectorAll('[data-action="profile"]').forEach((button) => {
    button.addEventListener('click', () => openProfileModal(findElectrician(button.dataset.id)));
  });

  catalog.querySelectorAll('[data-action="chat"]').forEach((button) => {
    button.addEventListener('click', () => openChatWithElectrician(button.dataset.id, button));
  });
}

function electricianCardHtml(electrician) {
  const skills = getSkills(electrician);
  const visibleSkills = skills.slice(0, 4);
  const hiddenCount = Math.max(0, skills.length - visibleSkills.length);
  const rating = Number(electrician.rating || 0);
  const available = electrician.available !== false;

  return [
    '<article class="card electrician-card">',
    '  <div class="electrician-card-header">',
    '    <div class="avatar">' + escapeHtml(getInitials(getElectricianName(electrician))) + '</div>',
    '    <div>',
    '      <h3 class="card-title">' + escapeHtml(getElectricianName(electrician)) + '</h3>',
    '      <div class="location-line">' + locationIcon + '<span>' + escapeHtml(electrician.city || 'City not listed') + '</span></div>',
    '    </div>',
    '  </div>',
    '  <div class="tag-list">' + visibleSkills.map(skillTagHtml).join('') + (hiddenCount ? skillTagHtml('+' + hiddenCount + ' more') : '') + '</div>',
    '  <div class="rating" aria-label="Rating ' + escapeHtml(rating.toFixed(1)) + ' out of 5">' + starRating(rating) + ' <span class="muted">(' + escapeHtml(String(electrician.total_reviews || 0)) + ')</span></div>',
    '  <p class="muted">' + escapeHtml(electrician.experience_years || 0) + ' years of experience</p>',
    '  <span class="badge ' + (available ? 'badge-available' : 'badge-unavailable') + '">' + (available ? 'Available' : 'Unavailable') + '</span>',
    '  <div class="card-actions">',
    '    <button class="btn-secondary" type="button" data-action="profile" data-id="' + escapeHtml(electrician.id) + '">View Profile</button>',
    '    <button class="btn-primary" type="button" data-action="chat" data-id="' + escapeHtml(electrician.id) + '">Chat</button>',
    '  </div>',
    '</article>'
  ].join('');
}

function renderJobs() {
  const list = document.getElementById('jobsList');

  if (!customerJobs.length) {
    list.innerHTML = [
      '<div class="card empty-state">',
      '  <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="2"/></svg></div>',
      '  <h3>No jobs yet. Post your first job!</h3>',
      '  <button class="btn-primary" id="emptyPostJobBtn" type="button">Post a Job</button>',
      '</div>'
    ].join('');
    document.getElementById('emptyPostJobBtn').addEventListener('click', () => setActiveTab('post'));
    return;
  }

  list.innerHTML = customerJobs.map(jobCardHtml).join('');

  list.querySelectorAll('[data-action="job-details"]').forEach((button) => {
    button.addEventListener('click', () => openJobDetailsModal(findJob(button.dataset.id)));
  });

  list.querySelectorAll('[data-action="job-chat"]').forEach((button) => {
    button.addEventListener('click', () => {
      window.location.href = 'chat.html?jobId=' + encodeURIComponent(button.dataset.id);
    });
  });
}

function jobCardHtml(job) {
  const status = normalizeStatus(job.status);
  const severity = normalizeSeverity(job.ai_severity);
  const assignedLine = job.electrician_id
    ? '<p class="muted">Assigned electrician: ' + escapeHtml(getElectricianNameById(job.electrician_id)) + '</p>'
    : '';
  const chatButton = job.electrician_id && status !== 'rejected'
    ? '<button class="btn-primary" type="button" data-action="job-chat" data-id="' + escapeHtml(job.id) + '">Open Chat</button>'
    : '';

  return [
    '<article class="card job-card">',
    '  <div>',
    '    <h3 class="card-title">' + escapeHtml(job.title || 'Electrical job') + '</h3>',
    '    <p class="muted">' + escapeHtml(formatDateTime(job.created_at)) + '</p>',
    '  </div>',
    '  <div class="tag-list">',
    '    <span class="badge badge-status-' + status + '">' + escapeHtml(toTitleCase(status)) + '</span>',
    job.ai_issue_type ? '    <span class="badge badge-soft">' + escapeHtml(job.ai_issue_type) + '</span>' : '',
    job.ai_severity ? '    <span class="badge badge-severity-' + severity + '">' + escapeHtml(toTitleCase(severity)) + '</span>' : '',
    '  </div>',
    assignedLine,
    '  <p class="muted line-clamp">' + escapeHtml(job.ai_explanation || job.description || 'No AI explanation available yet.') + '</p>',
    '  <div class="card-actions">',
    chatButton,
    '    <button class="btn-secondary" type="button" data-action="job-details" data-id="' + escapeHtml(job.id) + '">View Details</button>',
    '  </div>',
    '</article>'
  ].join('');
}

function renderAiResults(result) {
  const results = document.getElementById('aiResults');
  const job = result.job || {};
  const matches = normalizeMatches(result.matches || result.electricians || []);

  lastCreatedJob = job;
  lastMatches = matches;
  document.getElementById('postComposer').classList.add('hidden');
  results.classList.remove('hidden');

  results.innerHTML = [
    diagnosisCardHtml(job),
    '<div class="dashboard-title"><h1>Top Matched Electricians</h1><p>AI ranked these electricians for the diagnosis and location.</p></div>',
    '<div class="catalog-grid">' + topMatchCardsHtml(matches, 'select-match') + '</div>',
    '<div class="card-actions"><button class="btn-secondary" id="postAnotherJobBtn" type="button">Post Another Job</button></div>'
  ].join('');

  results.querySelectorAll('[data-action="select-match"]').forEach((button) => {
    button.addEventListener('click', () => selectMatchedElectrician(Number(button.dataset.index), button));
  });

  applyMatchScoreBars(results);
  document.getElementById('postAnotherJobBtn').addEventListener('click', resetPostForm);
}

function diagnosisCardHtml(job) {
  const severity = normalizeSeverity(job.ai_severity || job.severity);
  const suggestedSkills = getSuggestedSkills(job);

  return [
    '<article class="card diagnosis-card">',
    '  <h3>AI Diagnosis</h3>',
    '  <div class="tag-list">',
    job.ai_issue_type ? '    <span class="badge badge-soft">' + escapeHtml(job.ai_issue_type) + '</span>' : '',
    job.ai_severity ? '    <span class="badge badge-severity-' + severity + '">' + escapeHtml(toTitleCase(severity)) + '</span>' : '',
    '  </div>',
    '  <p>' + escapeHtml(job.ai_explanation || job.explanation || 'AI diagnosis is available for this job.') + '</p>',
    '  <div class="tag-list">' + suggestedSkills.map(skillTagHtml).join('') + '</div>',
    '</article>'
  ].join('');
}

function topMatchCardsHtml(matches, action) {
  if (!matches.length) {
    return '<div class="card empty-state"><h3>No matches found</h3><p>Try another description or city.</p></div>';
  }

  return matches.slice(0, 3).map((match, index) => {
    const electrician = match.electrician;
    const score = match.score;

    return [
      '<article class="card match-card">',
      '  <h3 class="card-title">' + escapeHtml(getElectricianName(electrician)) + '</h3>',
      '  <div class="location-line">' + locationIcon + '<span>' + escapeHtml(electrician.city || 'City not listed') + '</span></div>',
      '  <div class="tag-list">' + getSkills(electrician).slice(0, 4).map(skillTagHtml).join('') + '</div>',
      '  <div class="match-score"><span>Match score</span><strong>' + score + '%</strong></div>',
      '  <div class="match-score-bar"><div class="match-score-fill" data-score="' + score + '"></div></div>',
      '  <p class="muted"><em>' + escapeHtml(match.reason || 'Strong match for your issue and location.') + '</em></p>',
      '  <button class="btn-primary" type="button" data-action="' + action + '" data-index="' + index + '">Select This Electrician</button>',
      '</article>'
    ].join('');
  }).join('');
}

// Job posting isolates multipart payload creation from the UI actions that trigger it.
function handleImagePreview() {
  const file = document.getElementById('jobImage').files[0];
  const preview = document.getElementById('imagePreview');

  if (!file) {
    preview.classList.remove('is-visible');
    preview.removeAttribute('src');
    return;
  }

  preview.src = URL.createObjectURL(file);
  preview.classList.add('is-visible');
}

function buildJobFormData(requireImage) {
  const title = document.getElementById('jobTitle').value.trim();
  const description = document.getElementById('jobDescription').value.trim();
  const city = document.getElementById('jobCity').value.trim();
  const image = document.getElementById('jobImage').files[0];

  if (!title || !description || !city) {
    showToast('Please complete the job title, description, and city.', 'error');
    return null;
  }

  if (requireImage && !image) {
    showToast('Please upload an image for AI Smart Match.', 'error');
    return null;
  }

  const formData = new FormData();
  formData.append('customer_id', getUserId());
  formData.append('title', title);
  formData.append('description', description);
  formData.append('city', city);

  if (image) {
    formData.append('image', image);
  }

  return formData;
}

async function handleAiSmartMatch() {
  const button = document.getElementById('getAiMatchBtn');
  const formData = buildJobFormData(true);

  if (!formData) {
    return;
  }

  formData.append('use_ai', 'true');
  button.disabled = true;

  try {
    const result = await requestFormData('/api/jobs', formData, 'AI is analyzing your issue...');
    showToast('AI match completed.', 'success');
    renderAiResults(result);
    await loadJobs();
  } catch (error) {
    showRequestError(error);
  } finally {
    button.disabled = false;
  }
}

async function handleManualJobPost() {
  const button = document.getElementById('postManualJobBtn');
  const formData = buildJobFormData(false);

  if (!formData) {
    return;
  }

  formData.append('use_ai', 'false');
  button.disabled = true;

  try {
    await requestFormData('/api/jobs', formData, 'Posting your job...');
    showToast('Job posted for electricians to review.', 'success');
    resetPostForm();
    await loadJobs();
    setActiveTab('jobs');
  } catch (error) {
    showRequestError(error);
  } finally {
    button.disabled = false;
  }
}

async function selectMatchedElectrician(index, button) {
  const match = lastMatches[index];

  if (!lastCreatedJob || !lastCreatedJob.id || !match || !match.electrician.id) {
    showToast('Could not select that electrician. Please try again.', 'error');
    return;
  }

  button.disabled = true;

  try {
    await requestJson('/api/jobs/' + encodeURIComponent(lastCreatedJob.id) + '/status', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        status: 'matched',
        electrician_id: match.electrician.id
      })
    }, 'Notifying electrician...');

    showToast('Job posted and electrician notified!', 'success');
    await loadJobs();
    setActiveTab('jobs');
  } catch (error) {
    showRequestError(error);
  } finally {
    button.disabled = false;
  }
}

function resetPostForm() {
  document.getElementById('jobForm').reset();
  document.getElementById('imagePreview').classList.remove('is-visible');
  document.getElementById('postComposer').classList.remove('hidden');
  document.getElementById('aiResults').classList.add('hidden');
  document.getElementById('aiResults').innerHTML = '';

  if (customerProfile && customerProfile.city) {
    document.getElementById('jobCity').value = customerProfile.city;
  }
}

// Modal composition centralizes rich detail views without duplicating page markup.
function openProfileModal(electrician) {
  if (!electrician) {
    return;
  }

  const available = electrician.available !== false;
  openModal([
    '<h2 id="modalTitle">' + escapeHtml(getElectricianName(electrician)) + '</h2>',
    '<div class="detail-list">',
    detailRow('City', electrician.city || 'Not listed'),
    detailRow('Phone', electrician.phone || 'Not listed'),
    detailRow('Email', electrician.email || 'Not listed'),
    detailRow('Skills', '<div class="tag-list">' + getSkills(electrician).map(skillTagHtml).join('') + '</div>', true),
    detailRow('Bio', electrician.bio || 'No bio provided.'),
    detailRow('Rating', starRating(Number(electrician.rating || 0)) + ' (' + escapeHtml(String(electrician.total_reviews || 0)) + ' reviews)', true),
    detailRow('Experience', (electrician.experience_years || 0) + ' years'),
    detailRow('Status', '<span class="badge ' + (available ? 'badge-available' : 'badge-unavailable') + '">' + (available ? 'Available' : 'Unavailable') + '</span>', true),
    '</div>'
  ].join(''));
}

function openJobDetailsModal(job) {
  if (!job) {
    return;
  }

  const status = normalizeStatus(job.status);
  const severity = normalizeSeverity(job.ai_severity);

  openModal([
    '<h2 id="modalTitle">' + escapeHtml(job.title || 'Job details') + '</h2>',
    '<div class="detail-list">',
    detailRow('Date posted', formatDateTime(job.created_at)),
    detailRow('Status', '<span class="badge badge-status-' + status + '">' + escapeHtml(toTitleCase(status)) + '</span>', true),
    detailRow('City', job.city || 'Not listed'),
    detailRow('Description', job.description || 'No description available.'),
    detailRow('Issue type', job.ai_issue_type || 'Not available'),
    detailRow('Severity', job.ai_severity ? '<span class="badge badge-severity-' + severity + '">' + escapeHtml(toTitleCase(severity)) + '</span>' : 'Not available', Boolean(job.ai_severity)),
    detailRow('AI explanation', job.ai_explanation || 'Not available'),
    detailRow('Suggested skills', '<div class="tag-list">' + getSuggestedSkills(job).map(skillTagHtml).join('') + '</div>', true),
    '</div>'
  ].join(''));
}

function openAiFinderModal() {
  openModal([
    '<h2 id="modalTitle">AI Electrician Finder</h2>',
    '<p class="muted">Describe your problem and let AI find the best electrician</p>',
    '<form id="quickAiForm" novalidate>',
    '  <div class="form-group">',
    '    <label for="quickProblem">What is your electrical problem?</label>',
    '    <textarea id="quickProblem" required></textarea>',
    '  </div>',
    '  <div class="form-group">',
    '    <label for="quickCity">City</label>',
    '    <input type="text" id="quickCity" required value="' + escapeHtml((customerProfile && customerProfile.city) || '') + '">',
    '  </div>',
    '  <button class="btn-primary btn-full" id="quickAiSubmitBtn" type="submit">Find Best Match</button>',
    '</form>',
    '<div class="modal-matches" id="quickAiResults"></div>'
  ].join(''), false);

  document.getElementById('quickAiForm').addEventListener('submit', handleQuickAiSubmit);
}

async function handleQuickAiSubmit(event) {
  event.preventDefault();

  const button = document.getElementById('quickAiSubmitBtn');
  const description = document.getElementById('quickProblem').value.trim();
  const city = document.getElementById('quickCity').value.trim();
  const results = document.getElementById('quickAiResults');

  if (!description || !city) {
    showToast('Please describe the problem and city.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('customer_id', getUserId());
  formData.append('title', 'Quick AI Match');
  formData.append('description', description);
  formData.append('city', city);
  formData.append('use_ai', 'true');

  button.disabled = true;
  results.innerHTML = '<div class="card"><p class="muted">AI is finding the best matches...</p></div>';

  try {
    const result = await requestFormData('/api/jobs', formData, 'Finding best match...');
    const job = result.job || {};
    const matches = normalizeMatches(result.matches || []);
    lastCreatedJob = job;
    lastMatches = matches;

    results.innerHTML = [
      diagnosisCardHtml(job),
      '<h3>Top Matched Electricians</h3>',
      '<div class="modal-matches">' + topMatchCardsHtml(matches, 'quick-select-match') + '</div>'
    ].join('');

    results.querySelectorAll('[data-action="quick-select-match"]').forEach((selectButton) => {
      selectButton.addEventListener('click', () => selectMatchedElectrician(Number(selectButton.dataset.index), selectButton));
    });

    applyMatchScoreBars(results);
    await loadJobs();
  } catch (error) {
    results.innerHTML = '';
    showRequestError(error);
  } finally {
    button.disabled = false;
  }
}

function openModal(html, wide = true) {
  const overlay = document.getElementById('modalOverlay');
  const box = overlay.querySelector('.modal-box');
  document.getElementById('modalContent').innerHTML = html;
  box.classList.toggle('modal-wide', wide);
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.getElementById('modalContent').innerHTML = '';
}

// Chat starts a lightweight conversation job when no accepted job exists yet.
async function openChatWithElectrician(electricianId, button) {
  button.disabled = true;

  try {
    const data = await requestJson('/api/jobs/direct-chat', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        customer_id: getUserId(),
        electrician_id: electricianId,
        city: customerProfile && customerProfile.city ? customerProfile.city : ''
      })
    }, 'Starting chat...');

    if (!data.job || !data.job.id) {
      showToast('Could not start chat. Please try again.', 'error');
      return;
    }

    window.location.href = 'chat.html?jobId=' + encodeURIComponent(data.job.id) + '&electricianId=' + encodeURIComponent(electricianId);
  } catch (error) {
    showRequestError(error);
  } finally {
    button.disabled = false;
  }
}

// Formatting helpers absorb uneven API shapes and keep templates readable.
function normalizeArray(data, key) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data[key])) {
    return data[key];
  }

  return [];
}

function normalizeMatches(matches) {
  return normalizeArray(matches, 'matches').map((match) => {
    const electrician = match.electrician || match.user || match;
    const rawScore = Number(match.matchScore ?? match.match_score ?? match.score ?? electrician.match_score ?? 0);
    const score = Math.max(0, Math.min(100, Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)));

    return {
      electrician,
      score,
      reason: match.reason || match.ai_reason || match.explanation || match.matchReason || ''
    };
  }).filter((match) => match.electrician && match.electrician.id);
}

function applyMatchScoreBars(root) {
  root.querySelectorAll('.match-score-fill[data-score]').forEach((bar) => {
    const score = Math.max(0, Math.min(100, Number(bar.dataset.score || 0)));
    bar.style.width = score + '%';
  });
}

function getElectricianName(electrician) {
  if (!electrician) {
    return 'Electrician';
  }

  return electrician.name || electrician.full_name || electrician.fullName || 'Electrician';
}

function getElectricianNameById(id) {
  const electrician = findElectrician(id);
  return electrician ? getElectricianName(electrician) : 'Assigned electrician';
}

function getSkills(item) {
  return Array.isArray(item && item.skills) ? item.skills : [];
}

function getSuggestedSkills(job) {
  return Array.isArray(job.ai_suggested_skills)
    ? job.ai_suggested_skills
    : Array.isArray(job.suggestedSkills)
      ? job.suggestedSkills
      : [];
}

function findElectrician(id) {
  return electricianCache.find((electrician) => String(electrician.id) === String(id));
}

function findJob(id) {
  return customerJobs.find((job) => String(job.id) === String(id));
}

function getInitials(name) {
  return String(name || 'E')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'E';
}

function starRating(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating);
}

function skillTagHtml(skill) {
  return '<span class="skill-tag">' + escapeHtml(toTitleCase(skill)) + '</span>';
}

function detailRow(label, value, valueIsHtml) {
  return '<div class="detail-row"><strong>' + escapeHtml(label) + '</strong><span>' + (valueIsHtml ? value : escapeHtml(value)) + '</span></div>';
}

function emptyState(title, message) {
  return [
    '<div class="card empty-state">',
    '  <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>',
    '  <h3>' + escapeHtml(title) + '</h3>',
    '  <p>' + escapeHtml(message) + '</p>',
    '</div>'
  ].join('');
}

function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return ['pending', 'matched', 'accepted', 'rejected', 'completed'].includes(value) ? value : 'pending';
}

function normalizeSeverity(severity) {
  const value = String(severity || 'medium').toLowerCase();
  return ['low', 'medium', 'high'].includes(value) ? value : 'medium';
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


