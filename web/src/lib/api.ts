// Calls to api.backx.trade. The session is an HttpOnly cookie, so every call sends credentials.
const BASE = import.meta.env.VITE_API_URL || 'https://api.backx.trade';

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(BASE + path, { ...init, credentials: 'include' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, body.error || 'error');
  return body as T;
}
