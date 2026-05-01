const roleButtons = Array.from(document.querySelectorAll('.role-option'));
const registerForm = document.getElementById('registerForm');
const otpForm = document.getElementById('otpForm');
const electricianFields = document.getElementById('electricianFields');
const registrationFormWrap = document.getElementById('registrationFormWrap');
const otpSection = document.getElementById('otpSection');
const resendCodeBtn = document.getElementById('resendCodeBtn');

let selectedRole = 'customer';
let pendingRegistration = null;
let pendingUserId = '';

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
  return Array.from(document.querySelectorAll('#skillsGrid input:checked')).map((input) => input.value);
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
    const data = await requestApi('/api/auth/verify-otp', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({
        email: pendingRegistration.email,
        token: otpValue,
        ...pendingRegistration
      })
    }, 'Verifying your email...');

    localStorage.setItem('accessToken', data.accessToken || '');
    localStorage.setItem('userId', data.userId || pendingUserId);
    localStorage.setItem('role', data.role || pendingRegistration.role);
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


