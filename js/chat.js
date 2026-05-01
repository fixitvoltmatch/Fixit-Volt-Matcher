const SUPABASE_URL = 'https://zthgrdpebfhxssrzuipn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0Nx_I-pahy66Zbpa0UXUQQ_osJpIIM6';

const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const MESSAGE_POLL_INTERVAL_MS = 2500;

const messagesArea = document.getElementById('messagesArea');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

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

  row.id = 'msg-' + msg.id;
  row.className = 'chat-bubble-row ' + (isMine ? 'mine' : 'other');
  bubble.className = 'chat-bubble ' + (isMine ? 'chat-bubble-mine' : 'chat-bubble-other');
  bubble.textContent = msg.content || '';
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

function appendOptimisticMessage(content) {
  const tempId = 'temp-' + Date.now();

  appendMessage({
    id: tempId,
    sender_id: getUserId(),
    content,
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

  if (!content) {
    setFieldError(messageInput, 'Message is required.');
    return;
  }

  clearFieldError(messageInput);
  const tempId = appendOptimisticMessage(content);
  messageInput.value = '';
  messageInput.focus();

  try {
    const data = await requestJsonQuiet('/api/messages', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        job_id: jobId,
        sender_id: getUserId(),
        content
      })
    });

    if (data.message) {
      markMessageSent(tempId, data.message);
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


