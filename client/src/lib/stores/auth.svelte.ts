import { browser } from '$app/environment';
import type { HostInfo } from '../types';

class AuthStore {
  host = $state<HostInfo | null>(null);
  token = $state<string | null>(null);
  loading = $state<boolean>(true);
  validated = $state<boolean>(false);

  constructor() {
    if (browser) {
      this.token = localStorage.getItem('qaweb_token');
      this.host = JSON.parse(localStorage.getItem('qaweb_host') || 'null');
      // Verify token is still valid on server side
      this.validate();
    } else {
      this.loading = false;
    }
  }

  get isLoggedIn(): boolean {
    return !!this.token && !!this.host;
  }

  /** Verify the stored token is still valid by calling /api/auth/me. */
  async validate() {
    if (!this.token || !this.host) {
      this.clearAuth();
      this.loading = false;
      this.validated = true;
      return;
    }

    try {
      const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE) || '/api';
      const res = await fetch(`${base}/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      if (res.ok) {
        const data = await res.json();
        this.host = data.host;
        if (browser) {
          localStorage.setItem('qaweb_host', JSON.stringify(data.host));
        }
      } else {
        // Token expired or invalid — clear everything
        this.clearAuth();
      }
    } catch {
      // Network unreachable — keep existing auth, user can retry
    } finally {
      this.loading = false;
      this.validated = true;
    }
  }

  setAuth(host: HostInfo, token: string) {
    this.host = host;
    this.token = token;
    this.validated = true;
    if (browser) {
      localStorage.setItem('qaweb_token', token);
      localStorage.setItem('qaweb_host', JSON.stringify(host));
    }
  }

  clearAuth() {
    this.host = null;
    this.token = null;
    this.validated = false;
    if (browser) {
      localStorage.removeItem('qaweb_token');
      localStorage.removeItem('qaweb_host');
    }
  }

  updateHost(host: HostInfo) {
    this.host = host;
    if (browser) {
      localStorage.setItem('qaweb_host', JSON.stringify(host));
    }
  }
}

export const auth = new AuthStore();
