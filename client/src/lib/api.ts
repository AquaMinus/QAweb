import { browser } from '$app/environment';
import type { AuthResponse, HostInfo } from './types';

const BASE = '/api';

let authToken: string | null = null;

/** Get the stored auth token. */
function getToken(): string | null {
  if (authToken) return authToken;
  if (browser) {
    authToken = localStorage.getItem('qaweb_token');
  }
  return authToken;
}

/** Set and persist the auth token. */
export function setToken(token: string | null): void {
  authToken = token;
  if (browser) {
    if (token) {
      localStorage.setItem('qaweb_token', token);
    } else {
      localStorage.removeItem('qaweb_token');
    }
  }
}

/** Check if user is logged in. */
export function isLoggedIn(): boolean {
  return !!getToken();
}

/** Make an authenticated API request. */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || 'UNKNOWN', data.message || 'Request failed', res.status);
  }

  return data as T;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'ApiError';
  }
}

// ── Auth API ──
export const authApi = {
  register: (email: string, password: string, displayName: string) =>
    request<AuthResponse>('POST', '/auth/register', { email, password, displayName }),

  login: (email: string, password: string) =>
    request<AuthResponse>('POST', '/auth/login', { email, password }),

  getMe: () =>
    request<{ host: HostInfo }>('GET', '/auth/me'),

  updateProfile: (displayName: string) =>
    request<{ host: HostInfo }>('PATCH', '/auth/profile', { displayName }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request<{ success: boolean }>('POST', '/auth/change-password', { oldPassword, newPassword }),

  forgotPassword: (email: string) =>
    request<{ success: boolean; message: string }>('POST', '/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ success: boolean }>('POST', '/auth/reset-password', { token, newPassword }),
};

// ── Question Bank API ──
export const questionsApi = {
  listSets: () =>
    request<{ sets: any[] }>('GET', '/questions/sets'),

  createSet: (data: { title: string; description?: string; coverImageUrl?: string }) =>
    request<any>('POST', '/questions/sets', data),

  getSet: (id: string) =>
    request<any>('GET', `/questions/sets/${id}`),

  updateSet: (id: string, data: any) =>
    request<any>('PATCH', `/questions/sets/${id}`, data),

  deleteSet: (id: string) =>
    request<any>('DELETE', `/questions/sets/${id}`),

  copySet: (id: string) =>
    request<any>('POST', `/questions/sets/${id}/copy`),

  addQuestion: (setId: string, data: any) =>
    request<any>('POST', `/questions/sets/${setId}/questions`, data),

  updateQuestion: (setId: string, questionId: string, data: any) =>
    request<any>('PATCH', `/questions/sets/${setId}/questions/${questionId}`, data),

  deleteQuestion: (setId: string, questionId: string) =>
    request<any>('DELETE', `/questions/sets/${setId}/questions/${questionId}`),

  importQuestions: (setId: string, formData: FormData) =>
    fetch(`${BASE}/questions/sets/${setId}/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    }).then(r => r.json()),

  exportQuestions: (setId: string, format: 'json' | 'csv' = 'json') =>
    fetch(`${BASE}/questions/sets/${setId}/export?format=${format}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then(r => r.blob()),

  downloadTemplate: (format: 'csv' | 'json' | 'txt') =>
    fetch(`${BASE}/questions/templates/${format}`).then(r => r.blob()),

  createShareLink: (setId: string, expiresInHours: number) =>
    request<any>('POST', `/questions/sets/${setId}/share`, { expiresInHours }),
};

// ── Rooms API ──
export const roomsApi = {
  create: (data: { questionSetId?: string; settings?: any }) =>
    request<any>('POST', '/rooms', data),

  getInfo: (pin: string) =>
    request<any>('GET', `/rooms/${pin}`),

  dissolve: (pin: string) =>
    request<any>('DELETE', `/rooms/${pin}`),

  toggleLock: (pin: string) =>
    request<any>('POST', `/rooms/${pin}/lock`),

  kickPlayer: (pin: string, sessionToken: string) =>
    request<any>('POST', `/rooms/${pin}/kick/${sessionToken}`),
};
