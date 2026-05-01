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

  const email = getLoginEmail();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showToast('Please enter your email and password.', 'error');
    return;
  }

  setFormDisabled(loginForm, true);
  showSpinner('Logging in...');

  try {
    const response = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({ email, password })
    });
    const data = await parseApiResponse(response);

    if (!response.ok) {
      showToast('Invalid email or password', 'error');
      return;
    }

    localStorage.setItem('accessToken', data.accessToken || '');
    localStorage.setItem('userId', data.userId || '');
    localStorage.setItem('role', data.role || '');

    if (document.getElementById('rememberMe').checked) {
      localStorage.setItem('rememberedEmail', email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }

    showToast('Welcome back!', 'success');
    window.setTimeout(redirectBasedOnRole, 450);
  } catch (error) {
    showToast('Something went wrong. Please try again.', 'error');
  } finally {
    hideSpinner();
    setFormDisabled(loginForm, false);
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();

  const email = document.getElementById('forgotEmail').value.trim() || getLoginEmail();

  if (!email) {
    showToast('Enter your email address first.', 'error');
    return;
  }

  setFormDisabled(forgotForm, true);
  showSpinner('Sending reset link...');

  try {
    await fetch(apiUrl('/api/auth/forgot-password'), {
      method: 'POST',
      headers: getPublicHeaders(),
      body: JSON.stringify({ email })
    });

    showToast('If that email exists we sent a reset link', 'success');
  } catch (error) {
    showToast('If that email exists we sent a reset link', 'success');
  } finally {
    hideSpinner();
    setFormDisabled(forgotForm, false);
  }
}


