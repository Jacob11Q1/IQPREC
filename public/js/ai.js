/* ============================================================
   IQPREC — ai.js (frontend)
   Client helpers for the AI endpoints.

   • callAIEndpoint(endpoint, params)  — non-streaming calls (captain,
     lineup, transfers, differentials). Wraps apiFetch, returns the
     unwrapped data, throws a labelled Error on failure.

   • streamAIResponse(endpoint, params, onToken, onDone, onError)
     — streams the chat response token-by-token.

   NOTE on streaming: the chat endpoint is an authenticated POST and the
   access token lives in sessionStorage (Pentagon L6 — never localStorage),
   NOT in a JS-readable cookie. The native EventSource API can only do
   GET and cannot attach an Authorization header, so it can't carry our
   bearer token. We therefore stream with fetch() + a ReadableStream
   reader and parse the Server-Sent-Events frames ourselves. Same SSE
   wire format the server emits — just a client that can authenticate.
   ============================================================ */

import { api } from './api.js';
import { getAccessToken } from './auth.js';

const API_BASE = '/api/v1';
const TOKEN_KEY = 'iqprec_token';

function resolveToken() {
  if (typeof window !== 'undefined' && window.accessToken) return window.accessToken;
  const fromModule = getAccessToken();
  if (fromModule) return fromModule;
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------
   callAIEndpoint(endpoint, params) — non-streaming AI call.
   Returns the response data object (e.g. { recommendation, gameweek }).
   Throws Error with .code on failure so the caller can show retry.
   ------------------------------------------------------------ */
export async function callAIEndpoint(endpoint, params = {}) {
  const res = await api.post(endpoint, params);
  if (!res.success) {
    const err = new Error(res.message || res.error || 'AI request failed');
    err.code = res.error || 'AI_ERROR';
    err.retryAfter = res.retryAfter;
    throw err;
  }
  return res.data;
}

/* ------------------------------------------------------------
   streamAIResponse(endpoint, params, onToken, onDone, onError)
   Opens a streamed POST to the AI endpoint and invokes:
     onToken(text)  — for each token chunk
     onDone(full)   — once the stream ends ([DONE])
     onError(err)   — on transport or server ({"error":...}) failure
   Returns an abort function the caller can invoke to cancel.
   ------------------------------------------------------------ */
export function streamAIResponse(endpoint, params, onToken, onDone, onError) {
  const controller = new AbortController();
  const url = endpoint.startsWith('/api/') ? endpoint : `${API_BASE}${endpoint}`;
  const token = resolveToken();

  (async () => {
    let full = '';
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
      });

      // A non-stream JSON error (jailbreak, suspended, rate-limited, 401…).
      const ctype = res.headers.get('Content-Type') || '';
      if (!res.ok || ctype.includes('application/json')) {
        let body = null;
        try { body = await res.json(); } catch { /* ignore */ }
        const err = new Error(body?.message || `Request failed (${res.status})`);
        err.code = body?.error || 'AI_ERROR';
        err.suspended = body?.suspended;
        err.strikes = body?.strikes;
        throw err;
      }

      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read until the stream closes.
      // SSE frames are separated by a blank line ("\n\n").
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);

          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.slice(5).trim();

          if (payload === '[DONE]') {
            if (typeof onDone === 'function') onDone(full);
            return;
          }
          // Server error frame: {"error":"AI_5001"}
          if (payload.startsWith('{')) {
            try {
              const obj = JSON.parse(payload);
              if (obj.error) {
                const err = new Error('AI stream error');
                err.code = obj.error;
                throw err;
              }
            } catch (e) {
              if (e.code) throw e;
            }
            continue;
          }
          // Token frame: a JSON-encoded string.
          let tok;
          try { tok = JSON.parse(payload); } catch { tok = payload; }
          full += tok;
          if (typeof onToken === 'function') onToken(tok, full);
        }
      }

      // Stream closed without an explicit [DONE] — treat as done.
      if (typeof onDone === 'function') onDone(full);
    } catch (err) {
      if (controller.signal.aborted) return; // user cancelled — silent
      if (typeof onError === 'function') onError(err);
    }
  })();

  return () => controller.abort();
}

export default { callAIEndpoint, streamAIResponse };
