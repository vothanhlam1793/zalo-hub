import { BACKEND_URL, REQUEST_TIMEOUT_MS } from '../config.js';

interface BackendCallResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

async function call(method: string, path: string, options: {
  token?: string;
  jsonBody?: unknown;
  formData?: FormData;
  timeoutMs?: number;
} = {}): Promise<BackendCallResult> {
  const url = `${BACKEND_URL}${path}`;
  const headers: Record<string, string> = {};

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  };

  if (options.formData) {
    init.body = options.formData;
  } else if (options.jsonBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.jsonBody);
  }

  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 504, body: { error: 'Backend request timeout' } };
    }
    if (err instanceof Error && err.message.includes('fetch')) {
      return { ok: false, status: 502, body: { error: `Backend unreachable: ${err.message}` } };
    }
    return { ok: false, status: 500, body: { error: err instanceof Error ? err.message : 'Unknown backend error' } };
  }
}

export const backend = {
  get: (path: string, token?: string) => call('GET', path, { token }),
  post: (path: string, body: unknown, token?: string) => call('POST', path, { token, jsonBody: body }),
  put: (path: string, body: unknown, token?: string) => call('PUT', path, { token, jsonBody: body }),
  delete: (path: string, token?: string) => call('DELETE', path, { token }),
  upload: (path: string, formData: FormData, token?: string) => call('POST', path, { token, formData }),
};
