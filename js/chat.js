const SUPABASE_URL = 'https://zthgrdpebfhxssrzuipn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0Nx_I-pahy66Zbpa0UXUQQ_osJpIIM6';

const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const MESSAGE_POLL_INTERVAL_MS = 2500;

const messagesArea = document.getElementById('messagesArea');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const chatImageInput = document.getElementById('chatImageInput');
const chatImagePreviewWrap = document.getElementById('chatImagePreviewWrap');
const chatImagePreview = document.getElementById('chatImagePreview');
const chatImagePreviewName = document.getElementById('chatImagePreviewName');
const chatImagePreviewSize = document.getElementById('chatImagePreviewSize');
const chatRemoveImageBtn = document.getElementById('chatRemoveImageBtn');

let jobId = '';
let electricianId = '';
let currentJob = null;
let supabaseClient = null;
let chatChannel = null;
let messagePollTimer = null;
let isPollingMessages = false;
let lastPollHadError = false;

document.addEventListener('DOMContentLoaded', initChatPage);
window.addEventListener('beforeunload', cleanupChat);

// Bootstrapping validates route state, loads history, then attaches realtime updates.
async function initChatPage() {
  redirectIfNotLoggedIn();

  const params = new URLSearchParams(window.location.search);
  jobId = params.get('jobId') || '';
  electricianId = params.get('electricianId') || '';

  if (!jobId && electricianId && getRole() === 'customer') {
    await createDirectChat(electricianId);
  }

  if (!jobId) {
    redirectBack();
    return;
  }

  document.getElementById('backBtn').addEventListener('click', redirectBack);
  messageForm.addEventListener('submit', handleSendMessage);
  messageInput.addEventListener('keydown', handleMessageKeydown);
  messageInput.addEventListener('input', () => clearFieldError(messageInput));

  // Image attachment handlers
  const chatImageBtn = document.getElementById('chatImageTrigger');
  if (chatImageBtn) {
    chatImageBtn.addEventListener('click', () => chatImageInput.click());
  }

  if (chatImageInput) {
    chatImageInput.addEventListener('change', handleChatImagePreview);
  }

  if (chatRemoveImageBtn) {
    chatRemoveImageBtn.addEventListener('click', clearChatImagePreview);
  }

  await loadJobDetails();
  await loadMessages();
  startMessagePolling();

  try {
    await loadSupabaseClientScript();
    setupRealtime();
  } catch (error) {
    console.warn('Realtime chat unavailable; message polling will continue.', error);
  }

  messageInput.focus();
}

function redirectBack() {
  window.location.href = getRole() === 'electrician' ? 'electrician.html' : 'customer.html';
}

async function requestJson(path, options, loadingMessage) {
  return requestApi(path, options, loadingMessage || 'Loading...');
}

async function requestJsonQuiet(path, options) {
  return requestApi(path, options, 'Loading...', { silent: true });
}

async function requestMessageFormData(formData) {
  const token = beginApiFeedback('Sending message...');

  try {
    const response = await fetch(apiUrl('/api/messages'), {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getToken()
        // Browser automatically sets Content-Type: multipart/form-data with boundary
      },
      body: formData
    });

    const data = await parseApiResponse(response);

    if (!response.ok) {
      if (response.status === 401) {
        handleSessionExpired();
      }
      throw createApiError(response, data);
    }

    return data;
  } catch (error) {
    throw normalizeNetworkError(error);
  } finally {
    if (token) {
      endApiFeedback(token);
    }
  }
}

function showRequestError(error) {
  if (error && error.status === 401) {
    handleSessionExpired();
    return;
  }

  showToast((error && error.userMessage) || 'Something went wrong. Please try again', 'error');
}

async function createDirectChat(targetElectricianId) {
  try {
    const data = await requestJson('/api/jobs/direct-chat', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        customer_id: getUserId(),
        electrician_id: targetElectricianId
      })
    }, 'Starting chat...');

    jobId = data && data.job && data.job.id ? data.job.id : '';
  } catch (error) {
    showRequestError(error);
  }
}

// Data loading renders stable chat state before realtime messages begin streaming.
async function loadJobDetails() {
  try {
    currentJob = await requestJson('/api/jobs/' + encodeURIComponent(jobId), {
      method: 'GET',
      headers: getAuthHeaders()
    }, 'Loading job details...');

    renderChatHeader(currentJob);
  } catch (error) {
    showRequestError(error);
    window.setTimeout(redirectBack, 800);
  }
}

async function loadMessages(options = {}) {
  const silent = Boolean(options.silent);

  try {
    const requestOptions = {
      method: 'GET',
      headers: getAuthHeaders()
    };
    const path = '/api/messages/' + encodeURIComponent(jobId);
    const data = silent
      ? await requestJsonQuiet(path, requestOptions)
      : await requestJson(path, requestOptions, 'Loading messages...');

    const messages = Array.isArray(data) ? data : Array.isArray(data.messages) ? data.messages : [];

    if (!messages.length) {
      if (!silent) {
        messagesArea.innerHTML = '';
        renderEmptyConversation();
      }
      return;
    }

    if (!silent) {
      messagesArea.innerHTML = '';
    }

    messages.forEach(appendMessage);
    lastPollHadError = false;
  } catch (error) {
    if (!silent) {
      showRequestError(error);
      return;
    }

    if (!lastPollHadError) {
      showRequestError(error);
      console.warn('Message refresh failed.', error);
    }

    lastPollHadError = true;
  }
}

function renderChatHeader(job) {
  const status = normalizeStatus(job.status);
  const statusEl = document.getElementById('chatStatus');

  document.getElementById('chatTitle').textContent = job.title || 'Fixit Volt Matcher Chat';
  statusEl.textContent = toTitleCase(status);
  statusEl.className = 'badge badge-status-' + status;
}

function renderEmptyConversation() {
  messagesArea.innerHTML = emptyState('No messages yet', 'Start the conversation about this job.', 'chat');
  const empty = messagesArea.querySelector('.empty-state');

  if (empty) {
    empty.id = 'emptyConversation';
  }
}

// Realtime is lazy-loaded so the HTML stays clean and initial page parse stays light.
function loadSupabaseClientScript() {
  if (window.supabase && window.supabase.createClient) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-supabase-client]');

    if (existingScript) {
      existingScript.addEventListener('load', resolve, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = SUPABASE_CDN_URL;
    script.async = true;
    script.dataset.supabaseClient = 'true';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

function setupRealtime() {
  if (!window.supabase || !window.supabase.createClient) {
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  chatChannel = supabaseClient
    .channel('chat-' + jobId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: 'job_id=eq.' + jobId
    }, (payload) => {
      const msg = payload.new;

      if (msg && !document.getElementById('msg-' + msg.id)) {
        removeEmptyConversation();
        appendMessage(msg);
      }
    })
    .subscribe();
}

function startMessagePolling() {
  stopMessagePolling();

  messagePollTimer = window.setInterval(pollMessagesOnce, MESSAGE_POLL_INTERVAL_MS);
}

async function pollMessagesOnce() {
  if (!jobId || isPollingMessages) {
    return;
  }

  isPollingMessages = true;

  try {
    await loadMessages({ silent: true });
  } finally {
    isPollingMessages = false;
  }
}

function stopMessagePolling() {
  if (messagePollTimer) {
    window.clearInterval(messagePollTimer);
  }

  messagePollTimer = null;
}

function cleanupChat() {
  stopMessagePolling();

  if (chatChannel && typeof chatChannel.unsubscribe === 'function') {
    chatChannel.unsubscribe();
  }

  chatChannel = null;
}

// Message rendering is idempotent because REST history and realtime can overlap.
function appendMessage(msg) {
  if (!msg || !msg.id || document.getElementById('msg-' + msg.id)) {
    return;
  }

  removeEmptyConversation();

  const isMine = String(msg.sender_id) === String(getUserId());
  const row = document.createElement('div');
  const bubble = document.createElement('div');
  const meta = document.createElement('div');
  const imageUrl = getMessageImageUrl(msg);
  const text = msg.content || '';

  row.id = 'msg-' + msg.id;
  row.className = 'chat-bubble-row ' + (isMine ? 'mine' : 'other');
  bubble.className = 'chat-bubble ' + (isMine ? 'chat-bubble-mine' : 'chat-bubble-other');

  if (imageUrl) {
    const imageLink = document.createElement('a');
    const image = document.createElement('img');

    imageLink.href = imageUrl;
    imageLink.target = '_blank';
    imageLink.rel = 'noopener noreferrer';
    image.className = 'chat-message-image';
    image.src = imageUrl;
    image.alt = 'Attached chat image';
    imageLink.appendChild(image);
    bubble.appendChild(imageLink);
  }

  if (text) {
    const textNode = document.createElement('div');
    textNode.className = imageUrl ? 'chat-message-text has-image' : 'chat-message-text';
    textNode.textContent = text;
    bubble.appendChild(textNode);
  }

  if (!imageUrl && !text) {
    bubble.textContent = '';
  }

  meta.className = 'chat-time';
  meta.textContent = formatRelativeTime(msg.created_at);

  if (isMine && msg.deliveryStatus) {
    meta.appendChild(createDeliveryIcon(msg.deliveryStatus));
  }

  row.appendChild(bubble);
  row.appendChild(meta);
  messagesArea.appendChild(row);
  scrollToBottom();
}

function appendOptimisticMessage(content, imageUrl) {
  const tempId = 'temp-' + Date.now();

  appendMessage({
    id: tempId,
    sender_id: getUserId(),
    content,
    image_url: imageUrl || '',
    created_at: new Date().toISOString(),
    deliveryStatus: 'pending'
  });

  return tempId;
}

function markMessageSent(tempId, message) {
  const tempRow = document.getElementById('msg-' + tempId);
  const realMessage = message || {};

  if (!tempRow) {
    appendMessage(Object.assign({}, realMessage, { deliveryStatus: 'sent' }));
    return;
  }

  const existingRealRow = realMessage.id ? document.getElementById('msg-' + realMessage.id) : null;
  if (existingRealRow) {
    tempRow.remove();
    updateMessageStatus(existingRealRow, 'sent', realMessage.created_at);
    return;
  }

  if (realMessage.id) {
    tempRow.id = 'msg-' + realMessage.id;
    
    // If server returned a real image URL, update the message to use it
    if (realMessage.image_url && realMessage.image_url !== '') {
      const bubble = tempRow.querySelector('.chat-bubble');
      const existingImage = bubble.querySelector('img.chat-message-image');
      
      if (existingImage) {
        // Update image with real URL from server
        existingImage.src = realMessage.image_url;
        const imageLink = existingImage.parentElement;
        if (imageLink && imageLink.tagName === 'A') {
          imageLink.href = realMessage.image_url;
        }
      } else if (!bubble.querySelector('img')) {
        // If no image element exists but server has image_url, create it
        const imageLink = document.createElement('a');
        const image = document.createElement('img');
        imageLink.href = realMessage.image_url;
        imageLink.target = '_blank';
        imageLink.rel = 'noopener noreferrer';
        image.className = 'chat-message-image';
        image.src = realMessage.image_url;
        image.alt = 'Attached chat image';
        imageLink.appendChild(image);
        bubble.insertBefore(imageLink, bubble.firstChild);
      }
    }
  }

  updateMessageStatus(tempRow, 'sent', realMessage.created_at);
}

function removeMessageById(id) {
  const row = document.getElementById('msg-' + id);

  if (row) {
    row.remove();
  }
}

function createDeliveryIcon(status) {
  const icon = document.createElement('span');
  icon.className = 'message-status-icon message-status-' + status;

  if (status === 'sent') {
    icon.textContent = '\u2713';
    icon.setAttribute('aria-label', 'Sent');
  } else {
    icon.setAttribute('aria-label', 'Sending');
  }

  icon.setAttribute('role', 'img');
  return icon;
}

function updateMessageStatus(row, status, createdAt) {
  const time = row.querySelector('.chat-time');

  if (!time) {
    return;
  }

  time.textContent = formatRelativeTime(createdAt);
  time.appendChild(createDeliveryIcon(status));
}

function showRetryToast(content) {
  const container = getToastContainer();
  const toast = document.createElement('button');

  toast.className = 'toast toast-error toast-action';
  toast.type = 'button';
  toast.textContent = 'Message failed to send. Tap to retry';
  toast.addEventListener('click', () => {
    toast.remove();
    messageInput.value = content;
    messageInput.focus();
    messageForm.requestSubmit();
  });
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add('toast-hide');
    window.setTimeout(() => {
      toast.remove();
    }, 250);
  }, 5000);
}

function removeEmptyConversation() {
  const empty = document.getElementById('emptyConversation');

  if (empty) {
    empty.remove();
  }
}

function scrollToBottom() {
  window.requestAnimationFrame(() => {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  });
}

async function handleSendMessage(event) {
  event.preventDefault();

  const content = messageInput.value.trim();
  const image = chatImageInput ? chatImageInput.files[0] : null;

  if (!content && !image) {
    setFieldError(messageInput, 'Message or image is required.');
    return;
  }

  // Validate required fields before sending
  const senderId = getUserId();
  if (!senderId) {
    showToast('Session expired. Please log in again.', 'error');
    window.setTimeout(() => window.location.href = 'login.html', 1500);
    return;
  }

  if (!jobId) {
    showToast('Unable to send message: Invalid job ID.', 'error');
    return;
  }

  clearFieldError(messageInput);

  const optimisticImageUrl = image ? URL.createObjectURL(image) : '';
  const tempId = appendOptimisticMessage(content, optimisticImageUrl);

  messageInput.value = '';
  messageInput.focus();

  try {
    let data;

    if (image) {
      const formData = new FormData();
      formData.append('job_id', jobId);
      formData.append('sender_id', senderId);
      formData.append('content', content);
      formData.append('image', image);

      data = await requestMessageFormData(formData);
      clearChatImagePreview();
    } else {
      data = await requestJsonQuiet('/api/messages', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          job_id: jobId,
          sender_id: senderId,
          content
        })
      });
    }

    if (data.message) {
      markMessageSent(tempId, data.message);
      
      // If message had an image, reload messages silently to ensure real image_url is displayed
      // This prevents stale blob URLs that disappear on refresh
      if (image) {
        window.setTimeout(async () => {
          await loadMessages({ silent: true });
        }, 500);
      }
    }
  } catch (error) {
    removeMessageById(tempId);
    showRetryToast(content);
    messageInput.value = content;
    messageInput.focus();
  }
}

function handleMessageKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
}

function handleChatImagePreview() {
  const file = chatImageInput ? chatImageInput.files[0] : null;

  if (!file) {
    clearChatImagePreview();
    return;
  }

  if (chatImagePreview) {
    chatImagePreview.src = URL.createObjectURL(file);
  }

  if (chatImagePreviewName) {
    chatImagePreviewName.textContent = file.name;
  }

  if (chatImagePreviewSize) {
    chatImagePreviewSize.textContent = formatFileSize(file.size);
  }

  if (chatImagePreviewWrap) {
    chatImagePreviewWrap.classList.add('is-visible');
  }

  if (chatImagePreview) {
    chatImagePreview.classList.add('is-visible');
  }

  clearFieldError(messageInput);
}

function clearChatImagePreview() {
  if (chatImageInput) {
    chatImageInput.value = '';
  }

  if (chatImagePreviewWrap) {
    chatImagePreviewWrap.classList.remove('is-visible');
  }

  if (chatImagePreview) {
    chatImagePreview.classList.remove('is-visible');
    chatImagePreview.removeAttribute('src');
  }

  if (chatImagePreviewName) {
    chatImagePreviewName.textContent = '';
  }

  if (chatImagePreviewSize) {
    chatImagePreviewSize.textContent = '';
  }
}

function getMessageImageUrl(msg) {
  return msg.image_url ||
    msg.imageUrl ||
    msg.attachment_url ||
    msg.attachmentUrl ||
    msg.file_url ||
    msg.fileUrl ||
    msg.image ||
    '';
}

// Formatting helpers keep status labels stable for the fixed chat header.
function normalizeStatus(status) {
  const value = String(status || 'pending').toLowerCase();
  return ['pending', 'matched', 'accepted', 'rejected', 'completed'].includes(value) ? value : 'pending';
}

function toTitleCase(value) {
  return String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}