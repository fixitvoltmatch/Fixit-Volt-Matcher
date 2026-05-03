const loginForm = document.getElementById('loginForm');
const forgotForm = document.getElementById('forgotForm');
const forgotPanel = document.getElementById('forgotPanel');
const forgotToggleBtn = document.getElementById('forgotToggleBtn');

document.addEventListener('DOMContentLoaded', initLoginPage);

// Bootstrapping handles existing sessions before attaching form listeners.
function initLoginPage() {
  if (isLoggedIn()) {
    redirectBasedOnRole();
    return;
  }

  const rememberedEmail = localStorage.getItem('rememberedEmail') || '';
  if (rememberedEmail) {
    document.getElementById('email').value = rememberedEmail;
    document.getElementById('rememberMe').checked = true;
  }

  loginForm.addEventListener('submit', handleLogin);
  forgotForm.addEventListener('submit', handleForgotPassword);
  forgotToggleBtn.addEventListener('click', toggleForgotPanel);

  Array.from(document.querySelectorAll('#loginForm input, #forgotForm input')).forEach((input) => {
    input.addEventListener('input', () => clearFieldError(input));
  });
}

function getLoginEmail() {
  return document.getElementById('email').value.trim();
}

function setFormDisabled(form, isDisabled) {
  Array.from(form.querySelectorAll('button, input')).forEach((element) => {
    element.disabled = isDisabled;
  });
}

function toggleForgotPanel() {
  forgotPanel.classList.toggle('hidden');
  document.getElementById('forgotEmail').value = getLoginEmail();

  if (!forgotPanel.classList.contains('hidden')) {
    document.getElementById('forgotEmail').focus();
  }
}

// Authentication calls stay small and explicit so failure states remain predictable.
async function handleLogin(event) {
  event.preventDefault();

  const emailField = document.getElementById('email');
  const passwordField = document.getElementById('password');
  const email = getLoginEmail();
  const password = passwordField.value;
  const button = document.getElementById('loginBtn');
  const isValid = validateEmailField(emailField) && validatePasswordField(passwordField);

  if (!isValid) {
    return;
  }

  setButtonLoading(button, true, 'Logging in');

  try {
    const data = await requestApi('/api/auth/login', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({ email, password })
    }, 'Logging in...');

    // Validate that critical fields are present
    if (!data.userId) {
      throw new Error('Login response missing userId');
    }
    if (!data.role) {
      throw new Error('Login response missing role');
    }

    localStorage.setItem('accessToken', data.accessToken || '');
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('role', data.role);

    if (document.getElementById('rememberMe').checked) {
      localStorage.setItem('rememberedEmail', email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }

    showToast('Welcome back!', 'success');
    window.setTimeout(redirectBasedOnRole, 450);
  } catch (error) {
    // Handle login-specific errors
    if (error.status === 401) {
      showToast('Incorrect email or password', 'error');
    } else if (error.status && error.status !== 401 && error.status < 500 && !error.isNetworkError) {
      showToast('Incorrect email or password', 'error');
    } else {
      showToast(error.message || 'Login failed. Please try again', 'error');
    }
  } finally {
    setButtonLoading(button, false);
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();

  const emailField = document.getElementById('forgotEmail');
  const button = document.getElementById('sendResetBtn');
  const email = emailField.value.trim() || getLoginEmail();

  if (!email) {
    setFieldError(emailField, 'Enter your email address first.');
    return;
  }

  emailField.value = email;
  if (!validateEmailField(emailField)) {
    return;
  }

  setButtonLoading(button, true, 'Sending');

  try {
    await requestApi('/api/auth/forgot-password', {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({ email })
    }, 'Sending reset link...');

    showToast('If that email exists we sent a reset link', 'success');
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(button, false);
  }
}


