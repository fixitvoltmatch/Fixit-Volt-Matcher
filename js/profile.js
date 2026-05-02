let userProfile = null;
let userSkills = [];

document.addEventListener('DOMContentLoaded', initProfilePage);

async function initProfilePage() {
  redirectIfNotLoggedIn();
  bindEvents();
  await loadProfileData();
}

function bindEvents() {
  document.getElementById('backBtn').addEventListener('click', goBack);
  document.getElementById('profileForm').addEventListener('submit', handleProfileUpdate);
  document.getElementById('deleteBtn').addEventListener('click', openDeleteConfirm);
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteConfirm);
  document.getElementById('confirmDeleteBtn').addEventListener('click', handleDeleteAccount);
  document.getElementById('deleteModalOverlay').addEventListener('click', closeDeleteConfirm);
  document.getElementById('skillInput').addEventListener('keypress', handleAddSkill);

  const inputs = document.querySelectorAll('#profileForm input:not([type="hidden"]), #profileForm textarea');
  inputs.forEach((input) => {
    input.addEventListener('input', () => clearFieldError(input));
  });
}

async function loadProfileData() {
  try {
    const data = await requestJson('/api/auth/me', {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (data && data.user) {
      userProfile = data.user;
      
      const emailField = document.getElementById('email');
      const fullNameField = document.getElementById('fullName');
      const cityField = document.getElementById('city');
      const phoneField = document.getElementById('phone');
      
      if (emailField) emailField.value = userProfile.email || '';
      if (fullNameField) fullNameField.value = userProfile.full_name || '';
      if (cityField) cityField.value = userProfile.city || '';
      if (phoneField) phoneField.value = userProfile.phone || '';
      
      updateAvatarDisplay(userProfile.full_name || userProfile.email);

      if (userProfile.role === 'electrician' && data.electrician) {
        const electrician = data.electrician;
        const electricianSection = document.getElementById('electricianSection');
        const bioField = document.getElementById('bio');
        const experienceField = document.getElementById('experience');
        const availableField = document.getElementById('available');
        
        if (electricianSection) electricianSection.style.display = 'block';
        if (bioField) bioField.value = electrician.bio || '';
        if (experienceField) experienceField.value = electrician.experience_years || 0;
        if (availableField) availableField.checked = electrician.available !== false;
        
        userSkills = Array.isArray(electrician.skills) ? electrician.skills : [];
        renderSkills();
      }
    }
  } catch (error) {
    showRequestError(error);
  }
}

function renderSkills() {
  const container = document.getElementById('skillsContainer');
  container.innerHTML = '';

  userSkills.forEach((skill, index) => {
    const tag = document.createElement('div');
    tag.className = 'skill-tag';
    tag.innerHTML = `
      <span>${escapeHtml(skill)}</span>
      <button type="button" class="skill-remove" data-index="${index}" aria-label="Remove skill">×</button>
    `;
    container.appendChild(tag);

    tag.querySelector('.skill-remove').addEventListener('click', (e) => {
      e.preventDefault();
      userSkills.splice(index, 1);
      renderSkills();
    });
  });

  document.getElementById('skills').value = JSON.stringify(userSkills);
}

function handleAddSkill(event) {
  if (event.key !== 'Enter') {
    return;
  }

  event.preventDefault();
  const input = document.getElementById('skillInput');
  const skill = input.value.trim();

  if (skill && !userSkills.includes(skill)) {
    userSkills.push(skill);
    input.value = '';
    renderSkills();
  }
}

async function handleProfileUpdate(event) {
  event.preventDefault();

  const formData = new FormData(document.getElementById('profileForm'));
  const updates = {
    full_name: formData.get('full_name'),
    city: formData.get('city'),
    phone: formData.get('phone')
  };

  const fullNameField = document.getElementById('fullName');
  const cityField = document.getElementById('city');
  const phoneField = document.getElementById('phone');

  if (!validateField(fullNameField, 'Full name is required')) {
    return;
  }
  if (!validateField(cityField, 'City is required')) {
    return;
  }
  if (!validateField(phoneField, 'Phone is required')) {
    return;
  }

  if (userProfile.role === 'electrician') {
    updates.bio = document.getElementById('bio').value;
    updates.experience_years = parseInt(document.getElementById('experience').value) || 0;
    updates.available = document.getElementById('available').checked;
    updates.skills = userSkills;
  }

  const saveBtn = document.getElementById('saveBtn');
  setButtonLoading(saveBtn, true, 'Saving');

  try {
    const data = await requestJson(`/api/profile/${getUserId()}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });

    showToast('Profile updated successfully!', 'success');
  } catch (error) {
    showRequestError(error);
  } finally {
    setButtonLoading(saveBtn, false);
  }
}

function openDeleteConfirm() {
  document.getElementById('deleteConfirmModal').classList.remove('hidden');
}

function closeDeleteConfirm() {
  document.getElementById('deleteConfirmModal').classList.add('hidden');
}

async function handleDeleteAccount() {
  const deleteBtn = document.getElementById('confirmDeleteBtn');
  setButtonLoading(deleteBtn, true, 'Deleting Account');

  try {
    await requestJson(`/api/profile/${getUserId()}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    showToast('Account deleted successfully. Redirecting...', 'success');
    
    // Clear session and redirect to homepage after a short delay
    setTimeout(() => {
      localStorage.clear();
      window.location.href = 'index.html';
    }, 1500);
  } catch (error) {
    closeDeleteConfirm();
    setButtonLoading(deleteBtn, false);
    
    if (error.status === 401) {
      showToast('Session expired. Please login again', 'error');
    } else if (error.status === 400) {
      showToast('Failed to delete account. Please try again', 'error');
    } else {
      showToast('Error deleting account. Please try again', 'error');
    }
  }
}

function goBack() {
  if (userProfile.role === 'customer') {
    window.location.href = 'customer.html';
  } else if (userProfile.role === 'electrician') {
    window.location.href = 'electrician.html';
  } else {
    window.location.href = 'index.html';
  }
}

// Request helper
async function requestJson(path, options, loadingMessage) {
  return requestApi(path, options, loadingMessage || 'Loading...');
}

// Validation helper
function validateField(field, message) {
  if (!field.value.trim()) {
    setFieldError(field, message);
    return false;
  }
  return true;
}

// HTML escape helper
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Generate initials from name
function getInitials(nameOrEmail) {
  if (!nameOrEmail) return '?';
  
  const trimmed = nameOrEmail.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  
  return '?';
}

// Update avatar display with initials
function updateAvatarDisplay(nameOrEmail) {
  const avatar = document.getElementById('profileAvatar');
  if (avatar) {
    const initials = getInitials(nameOrEmail);
    avatar.textContent = initials;
  }
}
