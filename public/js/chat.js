/* ============================================================
   IQPREC — chat.js
   AI assistant page. SSE streaming via fetch (bearer token attached).
   History capped at 20 entries (10 exchanges) sent as last 10 items.
   Squad context injected when available for personalised replies.
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t, getLanguage } from './i18n.js';
import { streamAIResponse } from './ai.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';

const state = {
  history: [],        // [{role, content}] — grows to max 20, capped on send
  squadContext: null, // lightweight object injected into every message
  gameweek: null,
  busy: false,
  _abort: null,
};

function $(sel, root = document) { return root.querySelector(sel); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function formatMessage(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/* ---- Scaffold ---- */
function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="page-head chat-page-head">
      <div>
        <h1 class="page-title" data-i18n="chatPage.title">AI Assistant</h1>
        <p class="page-sub" data-i18n="chatPage.sub">Ask me anything about your squad.</p>
      </div>
      <button class="btn btn-secondary btn-sm" id="clear-btn" type="button" data-i18n="chatPage.clear">Clear chat</button>
    </div>

    <div class="chat-thread" id="chat-thread" role="log" aria-live="polite" aria-label="Chat messages"></div>

    <div class="chat-input-bar">
      <textarea
        class="chat-input"
        id="chat-input"
        rows="1"
        maxlength="500"
        data-i18n-placeholder="chatPage.placeholder"
        placeholder="Type your question here…"
        aria-label="Message input"
      ></textarea>
      <button class="btn btn-primary chat-send" id="send-btn" type="button" aria-label="Send message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
          <path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/>
        </svg>
      </button>
    </div>
  `;
  applyTranslations(main);
}

/* ---- Message rendering ---- */
let _msgCounter = 0;

function appendMessage(role, content, streaming = false) {
  const thread = $('#chat-thread');
  if (!thread) return null;
  const id = `msg-${++_msgCounter}`;
  const isAi = role === 'assistant';
  const label = isAi ? t('chatPage.ai') : t('chatPage.you');
  const el = document.createElement('div');
  el.className = `chat-message chat-message--${isAi ? 'ai' : 'user'}`;
  el.id = id;
  el.innerHTML = `
    <div class="message-meta">${esc(label)}</div>
    <div class="message-bubble">${streaming
      ? `<span class="thinking-dots"><span></span><span></span><span></span></span>`
      : formatMessage(content)}</div>
  `;
  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return id;
}

function updateMessage(id, content, done = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const bubble = el.querySelector('.message-bubble');
  if (!bubble) return;
  bubble.innerHTML = done
    ? formatMessage(content)
    : `${esc(content)}<span class="typing-cursor"></span>`;
  const thread = $('#chat-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
}

function markError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('chat-message--error');
}

/* ---- Input ---- */
function setInputBusy(busy) {
  const input = $('#chat-input');
  const send = $('#send-btn');
  if (input) input.disabled = busy;
  if (send) send.disabled = busy;
  state.busy = busy;
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

/* ---- Send ---- */
async function send() {
  if (state.busy) return;
  const input = $('#chat-input');
  const text = (input?.value || '').trim();
  if (!text) return;
  input.value = '';
  autoResize(input);

  appendMessage('user', text);
  setInputBusy(true);
  const typingId = appendMessage('assistant', '', true);

  let full = '';
  const abort = streamAIResponse(
    '/api/v1/ai/chat',
    {
      message: text,
      conversationHistory: state.history.slice(-10),
      language: getLanguage(),
      squadContext: state.squadContext || undefined,
    },
    (token) => {
      full += token;
      updateMessage(typingId, full, false);
    },
    (fullText) => {
      updateMessage(typingId, fullText, true);
      state.history.push({ role: 'user', content: text });
      state.history.push({ role: 'assistant', content: fullText });
      if (state.history.length > 20) state.history = state.history.slice(-20);
      setInputBusy(false);
      state._abort = null;
    },
    (err) => {
      const code = err?.code || 'AI_ERROR';
      let msg;
      if (code === 'AI_4007') msg = t('chatPage.jailbreak');
      else if (code === 'AI_4008') msg = t('chatPage.suspended');
      else if (code === 'AI_4001' || code === 'RATE_LIMITED') msg = t('chatPage.rateLimited');
      else msg = t('chatPage.failed');
      updateMessage(typingId, msg, true);
      markError(typingId);
      setInputBusy(false);
      state._abort = null;
    }
  );
  state._abort = abort;
}

/* ---- Clear ---- */
function clearChat() {
  if (state._abort) { state._abort(); state._abort = null; }
  state.history = [];
  state.busy = false;
  setInputBusy(false);
  const thread = $('#chat-thread');
  if (thread) { thread.innerHTML = ''; }
  appendMessage('assistant', t('chatPage.greeting'));
}

/* ---- Wire ---- */
function wire() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('#send-btn')) send();
    else if (e.target.closest('#clear-btn')) clearChat();
  });

  document.addEventListener('keydown', (e) => {
    const input = $('#chat-input');
    if (e.target === input && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'chat-input') autoResize(e.target);
  });

  window.addEventListener('iqprec:languagechange', () => {
    applyTranslations();
  });
}

/* ---- Context load ---- */
async function loadContext() {
  try {
    const [gwResult, squadResult] = await Promise.allSettled([
      fetchCurrentGameweek(),
      fetchMySquad(),
    ]);
    if (gwResult.status === 'fulfilled') state.gameweek = gwResult.value?.gameweek;
    if (squadResult.status === 'fulfilled' && squadResult.value?.connected) {
      const sq = squadResult.value.squad;
      state.squadContext = {
        gameweek: state.gameweek,
        teamName: sq.teamName,
        bankValue: sq.bankValue,
        transfersAvailable: sq.transfersAvailable,
        squadPlayerIds: (sq.picks || [])
          .map((p) => p.player?.id ?? p.element)
          .filter(Boolean)
          .map(Number),
      };
    }
  } catch { /* non-fatal */ }
}

/* ---- Init ---- */
function init() {
  renderScaffold();
  wire();
  appendMessage('assistant', t('chatPage.greeting'));
  loadContext();
}

document.addEventListener('DOMContentLoaded', init);
