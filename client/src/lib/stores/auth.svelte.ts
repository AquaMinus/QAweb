import { browser } from '$app/environment';
import type { HostInfo } from '../types';

class AuthStore {
  host = $state<HostInfo | null>(null);
  token = $state<string | null>(null);
  loading = $state<boolean>(true);

  constructor() {
    if (browser) {
      this.token = localStorage.getItem('qaweb_token');
      this.host = JSON.parse(localStorage.getItem('qaweb_host') || 'null');
    }
    this.loading = false;
  }

  get isLoggedIn(): boolean {
    return !!this.token && !!this.host;
  }

  setAuth(host: HostInfo, token: string) {
    this.host = host;
    this.token = token;
    if (browser) {
      localStorage.setItem('qaweb_token', token);
      localStorage.setItem('qaweb_host', JSON.stringify(host));
    }
  }

  clearAuth() {
    this.host = null;
    this.token = null;
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
