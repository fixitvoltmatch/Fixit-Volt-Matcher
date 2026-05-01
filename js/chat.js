const SUPABASE_URL = 'https://zthgrdpebfhxssrzuipn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0Nx_I-pahy66Zbpa0UXUQQ_osJpIIM6';

const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
const MESSAGE_POLL_INTERVAL_MS = 2500;

const messagesArea = document.getElementById('messagesArea');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let jobId = '';
let electricianId = '';
let currentJob = null;
let supabaseClient = null;
let chatChannel = null;
let messagePollTimer = null;
let isPollingMessages = false;
let lastPollHadError = false;
let apiBusyCount = 0;

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

// API boundary: message history and sends use the orchestrator with bearer auth.
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

async function requestJsonQuiet(path, options) {
  const response = await fetch(apiUrl(path), options);
  const data = await parseApiResponse(response);

  if (!response.ok) {
    const error = new Error('API request failed');
    error.userMessage = getSafeErrorMessage(data);
    throw error;
  }

  return data;
}

function showRequestError(error) {
  showToast(error.userMessage || 'Something went wrong. Please try again.', 'error');
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
  messagesArea.innerHTML = [
    '<div class="card empty-state" id="emptyConversation">',
    '  <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9h8M8 13h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>',
    '  <h3>No messages yet</h3>',
    '  <p>Start the conversation about this job.</p>',
    '</div>'
  ].join('');
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
  const time = document.createElement('div');

  row.id = 'msg-' + msg.id;
  row.className = 'chat-bubble-row ' + (isMine ? 'mine' : 'other');
  bubble.className = 'chat-bubble ' + (isMine ? 'chat-bubble-mine' : 'chat-bubble-other');
  bubble.textContent = msg.content || '';
  time.className = 'chat-time';
  time.textContent = formatDateTime(msg.created_at);

  row.appendChild(bubble);
  row.appendChild(time);
  messagesArea.appendChild(row);
  scrollToBottom();
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
    return;
  }

  sendBtn.disabled = true;
  messageInput.disabled = true;

  try {
    const data = await requestJson('/api/messages', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        job_id: jobId,
        sender_id: getUserId(),
        content
      })
    }, 'Sending message...');

    if (data.message) {
      appendMessage(data.message);
    }

    messageInput.value = '';
  } catch (error) {
    showRequestError(error);
  } finally {
    sendBtn.disabled = false;
    messageInput.disabled = false;
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


