const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success === false) {
    const error = new Error(body?.error?.message ?? '요청을 처리하지 못했습니다.');
    error.code = body?.error?.code ?? 'REQUEST_FAILED';
    error.status = response.status;
    error.details = body?.error?.details;
    throw error;
  }

  return body?.data ?? {};
}

export const api = {
  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (payload) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  refresh: () => request('/auth/refresh', { method: 'POST' }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: (accessToken) =>
    request('/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  saveScore: (accessToken, accuracy) =>
    request('/leaderboard', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ accuracy }),
    }),
  leaderboard: (limit = 10) => request(`/leaderboard?limit=${limit}`),
};
