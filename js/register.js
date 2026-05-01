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
  const email = getTrimmedValue('email').toLowerCase();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const fullName = getTrimmedValue('fullName');
  const city = getTrimmedValue('city');
  const phone = getTrimmedValue('phone');
  const bio = getTrimmedValue('bio');
  const experienceYears = Number(document.getElementById('experienceYears').value || 0);

  if (!fullName || !email || !password || !confirmPassword || !city || !phone) {
    showToast('Please fill in all required fields.', 'error');
    return null;
  }

  if (password.length < 8) {
    showToast('Password must be at least 8 characters.', 'error');
    return null;
  }

  if (password !== confirmPassword) {
    showToast('Passwords do not match.', 'error');
    return null;
  }

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

function setFormDisabled(form, isDisabled) {
  Array.from(form.querySelectorAll('button, input, textarea')).forEach((element) => {
    element.disabled = isDisabled;
  });
}

// Network actions deliberately use only public auth endpoints during registration.
async function handleRegister(event) {
  event.preventDefault();

  const payload = buildRegistrationPayload();
  if (!payload) {
    return;
  }

  setFormDisabled(registerForm, true);
  showSpinner('Creating your account...');

  try {
    const response = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      showToast(getSafeErrorMessage(data), 'error');
      return;
    }

    pendingRegistration = payload;
    pendingUserId = data.userId || '';
    registrationFormWrap.classList.add('hidden');
    otpSection.classList.remove('hidden');
    document.getElementById('otpCode').focus();
    showToast('Check your email for the verification code.', 'success');
  } catch (error) {
    showToast('Something went wrong. Please try again.', 'error');
  } finally {
    hideSpinner();
    setFormDisabled(registerForm, false);
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
    showToast('Enter the 8 digit code from your email.', 'error');
    return;
  }

  setFormDisabled(otpForm, true);
  showSpinner('Verifying your email...');

  try {
    const response = await fetch(apiUrl('/api/auth/verify-otp'), {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({
        email: pendingRegistration.email,
        token: otpValue,
        ...pendingRegistration
      })
    });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      showToast(getSafeErrorMessage(data, 'Invalid or expired code.'), 'error');
      return;
    }

    localStorage.setItem('accessToken', data.accessToken || '');
    localStorage.setItem('userId', data.userId || pendingUserId);
    localStorage.setItem('role', data.role || pendingRegistration.role);
    showToast('Welcome to Fixit Volt Matcher!', 'success');
    window.setTimeout(redirectBasedOnRole, 500);
  } catch (error) {
    showToast('Something went wrong. Please try again.', 'error');
  } finally {
    hideSpinner();
    setFormDisabled(otpForm, false);
  }
}

async function handleResendCode() {
  if (!pendingRegistration) {
    showToast('Please create your account first.', 'error');
    return;
  }

  resendCodeBtn.disabled = true;
  showSpinner('Requesting a new code...');

  try {
    const response = await fetch(apiUrl('/api/auth/register'), {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify(pendingRegistration)
    });

    await parseApiResponse(response);

    if (response.ok) {
      showToast('We sent a new code to your email.', 'success');
    } else {
      showToast('Please check your inbox or try again soon.', 'error');
    }
  } catch (error) {
    showToast('Something went wrong. Please try again.', 'error');
  } finally {
    hideSpinner();
    resendCodeBtn.disabled = false;
  }
}


