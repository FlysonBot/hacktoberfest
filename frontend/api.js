// Small centralized API client. Every network call in the app goes through
// here so error handling (network / non-2xx / malformed JSON) lives in one
// place instead of being repeated at each call site.

export class ApiError extends Error {
  constructor(kind, status, message) {
    super(message);
    this.kind = kind; // 'network' | 'parse' | 'http'
    this.status = status;
  }
}

async function postJson(path, body, { signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ApiError('network', 0, `Network error calling ${path}: ${err.message}`);
  }

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError('parse', response.status, `${path} returned invalid JSON.`);
    }
  }

  if (!response.ok) {
    const detail = (json && (json.detail || json.message)) || `HTTP ${response.status}`;
    throw new ApiError('http', response.status, `${path} failed: ${detail}`);
  }

  return json;
}

export function postPlan(payload, options) {
  return postJson('/api/plan', payload, options);
}

export function postCaptions(payload, options) {
  return postJson('/api/captions', payload, options);
}

export function postExplain(payload, options) {
  return postJson('/api/explain', payload, options);
}
