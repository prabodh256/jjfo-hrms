// Shared API client — cookies, CSRF header, structured errors.

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res) {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return await res.json(); } catch { return null; }
  }
  try { return await res.text(); } catch { return null; }
}

export async function apiGet(url) {
  const res = await fetch(url, { credentials: 'include' });
  const body = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(body?.error || 'Request failed', res.status, body);
  }
  return body;
}

export async function apiMutate(url, method, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(data?.error || 'Request failed', res.status, data);
  }
  return res.status === 204 ? null : data;
}

export async function apiUpload(url, formData) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData
  });
  const data = await parseBody(res);
  if (!res.ok) throw new ApiError(data?.error || 'Upload failed', res.status, data);
  return data;
}
