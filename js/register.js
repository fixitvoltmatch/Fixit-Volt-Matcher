const roleButtons = Array.from(document.querySelectorAll('.role-option'));
const registerForm = document.getElementById('registerForm');
const otpForm = document.getElementById('otpForm');
const electricianFields = document.getElementById('electricianFields');
const registrationFormWrap = document.getElementById('registrationFormWrap');
const otpSection = document.getElementById('otpSection');
const resendCodeBtn = document.getElementById('resendCodeBtn');
const skillsPicker = document.getElementById('skillsPicker');

let selectedRole = 'customer';
let pendingRegistration = null;
let pendingLoginCredentials = null;
let pendingUserId = '';
let availableSkills = [];

document.addEventListener('DOMContentLoaded', initRegistrationPage);

// Bootstrapping keeps URL defaults and event wiring in one predictable place.
function initRegistrationPage() {
  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('role');

  if (requestedRole === 'electrician') {
    setRole('electrician');
  }

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => setRole(button.dataset.role));
  });

  registerForm.addEventListener('submit', handleRegister);
  otpForm.addEventListener('submit', handleVerifyOtp);
  resendCodeBtn.addEventListener('click', handleResendCode);

  Array.from(document.querySelectorAll('#registerForm input, #registerForm textarea, #otpForm input')).forEach((input) => {
    input.addEventListener('input', () => clearFieldError(input));
  });

  loadSkills();
}

function setRole(role) {
  selectedRole = role === 'electrician' ? 'electrician' : 'customer';

  roleButtons.forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.role === selectedRole);
  });

  electricianFields.classList.toggle('hidden', selectedRole !== 'electrician');
}

// Payload construction stays local so API calls receive already-normalized data.
function getTrimmedValue(id) {
  return document.getElementById(id).value.trim();
}

function collectSelectedSkills() {
  return Array.from(document.querySelectorAll('#skillsPicker input:checked')).map((input) => input.value);
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

async function loadSkills(checkedSkillName) {
  try {
    const skills = await requestApi('/api/skills', { method: 'GET', headers: getPublicHeaders() }, 'Loading categories...', { public: true });

    availableSkills = normalizeSkills(skills);
    renderSkills(checkedSkillName ? [checkedSkillName] : collectSelectedSkills());
  } catch (error) {
    skillsPicker.innerHTML = '<p class="input-help">Could not load categories. Please try refreshing.</p>';
  }
}

function renderSkills(checkedSkillNames = []) {
  const checked = new Set(checkedSkillNames.map((skill) => String(skill).trim().toLowerCase()));
  const categories = availableSkills.filter((skill) => skill.is_default);

  skillsPicker.innerHTML = categories.length
    ? skillGroupHtml('Electrical Categories', categories, checked)
    : '<p class="input-help">No categories available yet.</p>';
}

function skillGroupHtml(title, skills, checked) {
  if (!skills.length) {
    return '';
  }

  return [
    '<div class="skill-group">',
    '  <h3 class="skill-group-title">' + escapeHtml(title) + '</h3>',
    '  <div class="skill-checkbox-grid">',
    skills.map((skill) => skillCheckboxHtml(skill, checked.has(skill.name))).join(''),
    '  </div>',
    '</div>'
  ].join('');
}

function skillCheckboxHtml(skill, isChecked) {
  return [
    '<label class="checkbox-card">',
    '  <input type="checkbox" value="' + escapeHtml(skill.name) + '"' + (isChecked ? ' checked' : '') + '>',
    '  ' + escapeHtml(toTitleCase(skill.name)),
    '</label>'
  ].join('');
}

function buildRegistrationPayload() {
  if (!validateRegistrationForm()) {
    return null;
  }

  const email = getTrimmedValue('email').toLowerCase();
  const password = document.getElementById('password').value;
  const fullName = getTrimmedValue('fullName');
  const city = getTrimmedValue('city');
  const phone = getTrimmedValue('phone');
  const bio = getTrimmedValue('bio');
  const experienceYears = Number(document.getElementById('experienceYears').value || 0);

  const payload = {
    email,
    password,
    full_name: fullName,
    role: selectedRole,
    city,
    phone
  };

  if (selectedRole === 'electrician') {
    payload.skills = collectSelectedSkills();
    payload.bio = bio;
    payload.experience_years = Number.isFinite(experienceYears) ? experienceYears : 0;
  }

  return payload;
}

function validateRegistrationForm() {
  const fullNameField = document.getElementById('fullName');
  const emailField = document.getElementById('email');
  const phoneField = document.getElementById('phone');
  const passwordField = document.getElementById('password');
  const confirmField = document.getElementById('confirmPassword');
  const cityField = document.getElementById('city');

  const checks = [
    validateRequiredField(fullNameField, 'Full name is required.'),
    validateEmailField(emailField),
    validatePhoneField(phoneField),
    validatePasswordField(passwordField),
    validatePasswordMatchField(passwordField, confirmField),
    validateRequiredField(cityField, 'City is required.')
  ];

  return checks.every(Boolean);
}

function setFormDisabled(form, isDisabled) {
  Array.from(form.querySelectorAll('button, input, textarea')).forEach((element) => {
    element.disabled = isDisabled;
  });
}

// Network actions deliberately use only public auth endpoints during registration.
async function handleRegister(event) {
  event.preventDefault();

  const payload = buildRegistrationPayload();
  const button = document.getElementById('createAccountBtn');
  if (!payload) {
    return;
  }

  setButtonLoading(button, true, 'Creating');

  try {
    const data = await requestApi('/api/auth/register', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(payload)
    }, 'Creating your account...');

    pendingRegistration = payload;
    pendingLoginCredentials = {
      email: payload.email,
      password: payload.password
    };
    pendingUserId = data.userId || '';
    registrationFormWrap.classList.add('hidden');
    otpSection.classList.remove('hidden');
    document.getElementById('otpCode').focus();
    showToast('Check your email for the verification code.', 'success');
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(button, false);
  }
}

async function handleVerifyOtp(event) {
  event.preventDefault();

  if (!pendingRegistration) {
    showToast('Please create your account first.', 'error');
    return;
  }

  const otpValue = getTrimmedValue('otpCode').replace(/\D/g, '');
  if (!/^\d{8}$/.test(otpValue)) {
    setFieldError(document.getElementById('otpCode'), 'Enter the 8 digit code from your email.');
    return;
  }

  setButtonLoading(document.getElementById('verifyOtpBtn'), true, 'Verifying');

  try {
    await requestApi('/api/auth/verify-otp', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({
        email: pendingRegistration.email,
        token: otpValue,
        ...pendingRegistration
      })
    }, 'Verifying your email...');

    const loginData = await requestApi('/api/auth/login', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(pendingLoginCredentials)
    }, 'Starting your session...');

    localStorage.setItem('accessToken', loginData.accessToken || '');
    localStorage.setItem('userId', loginData.userId || pendingUserId);
    localStorage.setItem('role', loginData.role || pendingRegistration.role);
    pendingLoginCredentials = null;
    pendingRegistration = null;
    pendingUserId = '';
    showToast('Welcome to Fixit Volt Matcher!', 'success');
    window.setTimeout(redirectBasedOnRole, 500);
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(document.getElementById('verifyOtpBtn'), false);
  }
}

async function handleResendCode() {
  if (!pendingRegistration) {
    showToast('Please create your account first.', 'error');
    return;
  }

  setButtonLoading(resendCodeBtn, true, 'Sending');

  try {
    await requestApi('/api/auth/register', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(pendingRegistration)
    }, 'Requesting a new code...');

    showToast('We sent a new code to your email.', 'success');
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(resendCodeBtn, false);
  }
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
