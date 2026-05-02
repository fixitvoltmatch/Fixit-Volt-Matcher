const profileForm = document.getElementById('profileForm');
const saveBtn = document.getElementById('saveBtn');
const backBtn = document.getElementById('backBtn');
const deleteAccountBtn = document.getElementById('deleteAccountBtn');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const deleteConfirmCloseBtn = document.getElementById('deleteConfirmCloseBtn');
const deleteConfirmCancelBtn = document.getElementById('deleteConfirmCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
const deleteConfirmInput = document.getElementById('deleteConfirmInput');
const availabilityToggle = document.getElementById('availability-toggle');
const electricianSection = document.getElementById('electricianSection');
const skillsPicker = document.getElementById('skillsPicker');

let currentUserData = null;
let availableSkills = [];
let originalFormState = {};
let pendingChanges = {};

document.addEventListener('DOMContentLoaded', initProfilePage);

function initProfilePage() {
  redirectIfNotLoggedIn();
  
  profileForm.addEventListener('submit', handleSaveProfile);
  saveBtn.addEventListener('click', () => profileForm.dispatchEvent(new Event('submit')));
  backBtn.addEventListener('click', handleBack);
  deleteAccountBtn.addEventListener('click', openDeleteModal);
  deleteConfirmCloseBtn.addEventListener('click', closeDeleteModal);
  deleteConfirmCancelBtn.addEventListener('click', closeDeleteModal);
  deleteConfirmBtn.addEventListener('click', handleDeleteAccount);
  deleteConfirmInput.addEventListener('input', updateDeleteConfirmButton);
  availabilityToggle.addEventListener('change', handleAvailabilityChange);
  
  Array.from(profileForm.querySelectorAll('input:not([readonly]):not([type="checkbox"]), textarea')).forEach((input) => {
    input.addEventListener('input', trackFormChanges);
    input.addEventListener('change', trackFormChanges);
  });
  
  loadUserProfile();
  loadSkills();
}

function handleBack() {
  const role = getRole();
  if (role === 'customer') {
    window.location.href = 'customer.html';
  } else if (role === 'electrician') {
    window.location.href = 'electrician.html';
  } else {
    window.history.back();
  }
}

async function loadUserProfile() {
  try {
    const data = await requestApi('/api/users/' + encodeURIComponent(getUserId()), {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading your profile...');

    currentUserData = data;
    populateProfileForm(data);
    captureOriginalState();
  } catch (error) {
    showRequestError(error);
  }
}

function populateProfileForm(data) {
  const fullNameField = document.getElementById('fullName');
  const emailField = document.getElementById('email');
  const cityField = document.getElementById('city');
  const phoneField = document.getElementById('phone');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileNameDisplay = document.getElementById('profileNameDisplay');
  const profileRoleBadge = document.getElementById('profileRoleBadge');

  // Basic information
  const fullName = data.user.full_name || '';
  fullNameField.value = fullName;
  emailField.value = data.user.email || '';
  cityField.value = data.user.city || '';
  phoneField.value = data.user.phone || '';

  // Profile header
  const initials = getInitials(fullName);
  profileAvatar.textContent = initials;
  profileNameDisplay.textContent = fullName;

  // Role badge
  const role = getRole();
  const roleBadgeClass = role === 'electrician' ? 'badge-available' : 'badge-neutral';
  const roleLabel = role === 'electrician' ? 'Electrician' : 'Customer';
  profileRoleBadge.className = 'badge ' + roleBadgeClass;
  profileRoleBadge.textContent = roleLabel;

  // Show electrician fields if applicable
  if (role === 'electrician') {
    electricianSection.classList.remove('hidden');
    
    document.getElementById('bio').value = 
      data.electrician.bio || ''

    document.getElementById('experience-years').value = 
      data.electrician.experience_years || 0

    const availToggle = document.getElementById('availability-toggle')
    availToggle.checked = data.electrician.available === true

    document.querySelectorAll('input[name="skills"]')
      .forEach(cb => {
        cb.checked = (data.electrician.skills || [])
          .includes(cb.value)
      })
  }
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function captureOriginalState() {
  originalFormState = {
    fullName: document.getElementById('fullName').value,
    email: document.getElementById('email').value,
    city: document.getElementById('city').value,
    phone: document.getElementById('phone').value
  };

  if (getRole() === 'electrician') {
    originalFormState.bio = document.getElementById('bio').value;
    originalFormState.experienceYears = document.getElementById('experience-years').value;
    originalFormState.skills = collectSelectedSkills();
    originalFormState.isAvailable = document.getElementById('availability-toggle').checked;
  }

  pendingChanges = {};
  updateSaveButtonState();
}

function trackFormChanges() {
  const newState = getFormState();
  
  // Check if anything changed
  const hasChanges = Object.keys(newState).some((key) => {
    if (Array.isArray(newState[key]) && Array.isArray(originalFormState[key])) {
      return newState[key].join(',') !== originalFormState[key].join(',');
    }
    return newState[key] !== originalFormState[key];
  });

  updateSaveButtonState(hasChanges);
}

function getFormState() {
  const state = {
    fullName: document.getElementById('fullName').value,
    email: document.getElementById('email').value,
    city: document.getElementById('city').value,
    phone: document.getElementById('phone').value
  };

  if (getRole() === 'electrician') {
    state.bio = document.getElementById('bio').value;
    state.experienceYears = document.getElementById('experience-years').value;
    state.skills = collectSelectedSkills();
    state.isAvailable = document.getElementById('availability-toggle').checked;
  }

  return state;
}

function updateSaveButtonState(hasChanges = false) {
  saveBtn.disabled = !hasChanges;
}

function collectSelectedSkills() {
  return Array.from(document.querySelectorAll('#skillsPicker input:checked')).map((input) => input.value);
}

async function loadSkills() {
  try {
    const skills = await requestApi('/api/skills', { method: 'GET', headers: getPublicHeaders() }, '', { silent: true, public: true });

    availableSkills = normalizeSkills(skills);
    
    // If user data is already loaded, render with correct pre-checked values
    if (currentUserData) {
      const skillNames = Array.isArray(currentUserData.skills)
        ? currentUserData.skills.map((s) => String(s.name || s).trim().toLowerCase())
        : [];
      renderSkills(skillNames);
    }
  } catch (error) {
    skillsPicker.innerHTML = '<p class="input-help">Could not load categories. Please try refreshing.</p>';
  }
}

function normalizeSkills(data) {
  return (Array.isArray(data) ? data : [])
    .filter((skill) => skill && skill.name)
    .map((skill) => ({
      id: skill.id,
      name: String(skill.name).trim().toLowerCase(),
      category: skill.category || '',
      is_default: skill.is_default !== false
    }));
}

function renderSkills(checkedSkillNames = []) {
  const checked = new Set(checkedSkillNames.map((skill) => String(skill).trim().toLowerCase()));
  const categories = availableSkills.filter((skill) => skill.is_default);

  skillsPicker.innerHTML = categories.length
    ? skillGroupHtml('Electrical Categories', categories, checked)
    : '<p class="input-help">No categories available yet.</p>';

  // Re-attach change tracking
  Array.from(skillsPicker.querySelectorAll('input')).forEach((input) => {
    input.addEventListener('change', trackFormChanges);
  });
}

function skillGroupHtml(title, skills, checked) {
  if (!skills.length) {
    return '';
  }

  return [
    '<div class="skill-group">',
    '  <h3 class="skill-group-title">' + escapeHtmlShared(title) + '</h3>',
    '  <div class="skill-checkbox-grid">',
    skills.map((skill) => skillCheckboxHtml(skill, checked.has(skill.name))).join(''),
    '  </div>',
    '</div>'
  ].join('');
}

function skillCheckboxHtml(skill, isChecked) {
  return [
    '<label class="checkbox-card">',
    '  <input type="checkbox" name="skills" value="' + escapeHtmlShared(skill.name) + '"' + (isChecked ? ' checked' : '') + '>',
    '  ' + escapeHtmlShared(toTitleCase(skill.name)),
    '</label>'
  ].join('');
}

function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

async function handleSaveProfile(event) {
  event.preventDefault();

  if (!validateProfileForm()) {
    return;
  }

  const formState = getFormState();
  const payload = buildUpdatePayload(formState);

  if (Object.keys(payload).length === 0) {
    showToast('No changes to save', 'success');
    return;
  }

  setButtonLoading(saveBtn, true, 'Saving');

  try {
    await requestApi('/api/users/' + encodeURIComponent(getUserId()), {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    }, 'Updating your profile...');

    currentUserData = { ...currentUserData, ...payload };
    captureOriginalState();
    showToast('Profile updated!', 'success');
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

function buildUpdatePayload(newState) {
  const payload = {};

  if (newState.fullName !== originalFormState.fullName) {
    payload.full_name = newState.fullName;
  }
  if (newState.city !== originalFormState.city) {
    payload.city = newState.city;
  }
  if (newState.phone !== originalFormState.phone) {
    payload.phone = newState.phone;
  }

  if (getRole() === 'electrician') {
    if (newState.bio !== originalFormState.bio) {
      payload.bio = newState.bio;
    }
    if (newState.experienceYears !== originalFormState.experienceYears) {
      payload.experience_years = Number(newState.experienceYears) || 0;
    }
    if (newState.skills.join(',') !== originalFormState.skills.join(',')) {
      payload.skills = newState.skills;
    }
  }

  return payload;
}

function validateProfileForm() {
  const fullNameField = document.getElementById('fullName');
  const cityField = document.getElementById('city');
  const phoneField = document.getElementById('phone');

  const checks = [
    validateRequiredField(fullNameField, 'Full name is required.'),
    validateRequiredField(cityField, 'City is required.'),
    validatePhoneField(phoneField)
  ];

  return checks.every(Boolean);
}

async function handleAvailabilityChange() {
  const isAvailable = availabilityToggle.checked;
  
  try {
    await requestApi('/api/users/' + encodeURIComponent(getUserId()), {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ available: isAvailable })
    }, '');

    updateAvailabilityUI(isAvailable);
    const message = isAvailable ? 'You are now available' : 'You are now unavailable';
    showToast(message, 'success');
  } catch (error) {
    // Revert the toggle on error
    availabilityToggle.checked = !isAvailable;
    showRequestError(error);
  }
}

function updateAvailabilityUI(isAvailable) {
  const availabilityLabel = document.getElementById('availabilityLabel');
  const toggle = document.getElementById('availability-ttoggle');
  
  // Update both the toggle visual state and text/badge
  if (toggle) {
    toggle.checked = isAvailable;
  }
  if (availabilityLabel) {
    availabilityLabel.textContent = isAvailable ? 'Available' : 'Unavailable';
  }
}

function openDeleteModal() {
  deleteConfirmModal.classList.add('is-open');
  deleteConfirmModal.setAttribute('aria-hidden', 'false');
  deleteConfirmInput.value = '';
  deleteConfirmBtn.disabled = true;
  deleteConfirmInput.focus();
}

function closeDeleteModal() {
  deleteConfirmModal.classList.remove('is-open');
  deleteConfirmModal.setAttribute('aria-hidden', 'true');
  deleteConfirmInput.value = '';
  deleteConfirmBtn.disabled = true;
}

function updateDeleteConfirmButton() {
  const value = deleteConfirmInput.value.trim();
  deleteConfirmBtn.disabled = value !== 'DELETE';
}

async function handleDeleteAccount() {
  setButtonLoading(deleteConfirmBtn, true, 'Deleting');

  try {
    await requestApi('/api/auth/account', {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId: getUserId() })
    }, 'Deleting your account...');

    localStorage.clear();
    showToast('Account deleted', 'success');
    window.setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
  } catch (error) {
    setButtonLoading(deleteConfirmBtn, false);
    closeDeleteModal();
    showRequestError(error);
  }
}
