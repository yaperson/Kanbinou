// =============================================================================
// Kanbinou - Service Client API & Temps Réel (SSE)
// =============================================================================

class ApiService {
  constructor() {
    this.token = localStorage.getItem('kanbinou_token') || sessionStorage.getItem('kanbinou_token') || null;
    this.customBaseUrl = localStorage.getItem('kanbinou_api_url') || '';
    this.eventSource = null;
    this.listeners = new Map();
  }

  setToken(token, remember = true) {
    this.token = token;
    if (token) {
      if (remember) {
        localStorage.setItem('kanbinou_token', token);
        sessionStorage.removeItem('kanbinou_token');
      } else {
        sessionStorage.setItem('kanbinou_token', token);
        localStorage.removeItem('kanbinou_token');
      }
    } else {
      localStorage.removeItem('kanbinou_token');
      sessionStorage.removeItem('kanbinou_token');
    }
  }

  isRemembered() {
    return !!localStorage.getItem('kanbinou_token');
  }

  getRawBaseUrl() {
    return this.customBaseUrl;
  }

  setBaseUrl(url) {
    this.customBaseUrl = (url || '').trim();
    if (this.customBaseUrl) {
      localStorage.setItem('kanbinou_api_url', this.customBaseUrl);
    } else {
      localStorage.removeItem('kanbinou_api_url');
    }
    if (this.eventSource) {
      this.disconnectEvents();
    }
  }

  getBaseUrl() {
    if (this.customBaseUrl) {
      const cleaned = this.customBaseUrl.replace(/\/+$/, '');
      return cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
    }
    // Si on est sur GitHub Pages (*.github.io) sans serveur distant explicite, aucune API locale n'existe
    if (typeof window !== 'undefined' && window.location.hostname.includes('github.io')) {
      return null;
    }

    // Détection automatique du sous-dossier d'hébergement (ex: /kanbinou/dist/ ou /kanbinou/)
    if (typeof window !== 'undefined' && window.location.pathname) {
      const pathname = window.location.pathname;
      if (pathname.includes('/dist')) {
        const rootPath = pathname.substring(0, pathname.indexOf('/dist')).replace(/\/+$/, '');
        return `${rootPath}/api`;
      }
      const match = pathname.match(/^(\/[^\/]+)/);
      if (match && match[1] && match[1] !== '/' && match[1] !== '/api') {
        return `${match[1]}/api`;
      }
    }

    return '/api';
  }

  isAvailable() {
    return this.getBaseUrl() !== null;
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      // Pas de serveur API configuré (mode autonome local / GitHub Pages)
      return null;
    }

    const url = `${baseUrl}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    };

    if (config.body && typeof config.body === 'object') {
      config.body = JSON.stringify(config.body);
    }

    let response;
    try {
      response = await fetch(url, config);
    } catch (networkErr) {
      const err = new Error('Serveur injoignable ou appareil hors-ligne');
      err.status = 0;
      err.isNetworkError = true;
      throw err;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || `Erreur serveur (${response.status})`);
      error.status = response.status;
      error.debug = errorData.debug || null;
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // --- Auth ---
  async login(username, password, remember = true) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: { username, password, remember }
    });
    if (res && res.token) {
      this.setToken(res.token, remember);
    }
    return res;
  }

  async getAuthStatus() {
    try {
      return await this.request('/auth/status');
    } catch {
      return { initialized: true };
    }
  }

  async register(username, password, displayName, role = 'user', remember = true) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: { username, password, displayName, role, remember }
    });
    // Si c'est l'administrateur initial qui s'enregistre, le token est renvoyé
    if (res && res.token) {
      this.setToken(res.token, remember);
    }
    return res;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // --- Resources ---
  async getResources() {
    return this.request('/resources');
  }

  async createResource(resource) {
    return this.request('/resources', { method: 'POST', body: resource });
  }

  async updateResource(id, resource) {
    return this.request(`/resources/${id}`, { method: 'PUT', body: resource });
  }

  async deleteResource(id) {
    return this.request(`/resources/${id}`, { method: 'DELETE' });
  }

  // --- Allocations (Roadmap) ---
  async getAllocations() {
    return this.request('/allocations');
  }

  async createAllocation(allocation) {
    return this.request('/allocations', { method: 'POST', body: allocation });
  }

  async updateAllocation(id, allocation) {
    return this.request(`/allocations/${id}`, { method: 'PUT', body: allocation });
  }

  async deleteAllocation(id) {
    try {
      return await this.request(`/allocations/${id}`, { method: 'DELETE' });
    } catch (err) {
      return await this.request(`/allocations/${id}/delete`, { method: 'POST' });
    }
  }

  // --- Tasks ---
  async getTasks() {
    return this.request('/tasks');
  }

  async createTask(task) {
    return this.request('/tasks', { method: 'POST', body: task });
  }

  async deleteTask(id) {
    try {
      return await this.request(`/tasks/${id}`, { method: 'DELETE' });
    } catch (err) {
      return await this.request(`/tasks/${id}/delete`, { method: 'POST' });
    }
  }

  // --- Configuration ---
  async getConfig() {
    return this.request('/config');
  }

  async saveConfig(config) {
    return this.request('/config', { method: 'POST', body: config });
  }

  // --- Agenda CalDAV ---
  async testCalendarConnection(payload) {
    return this.request('/calendar/test', { method: 'POST', body: payload });
  }

  async pushCalendarEvents(payload) {
    return this.request('/calendar/push', { method: 'POST', body: payload });
  }

  // --- Temps Réel : Server-Sent Events (SSE) ---
  connectEvents(onEventCallback) {
    if (!this.isAvailable()) return;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const baseUrl = this.getBaseUrl();
    try {
      this.eventSource = new EventSource(`${baseUrl}/events`);
      let errorCount = 0;

      this.eventSource.onopen = () => {
        errorCount = 0;
      };

      this.eventSource.onmessage = (event) => {
        errorCount = 0;
        try {
          const data = JSON.parse(event.data);
          if (onEventCallback) {
            onEventCallback(data);
          }
        } catch (err) {
          console.error('[SSE] Erreur parsing message :', err);
        }
      };

      this.eventSource.onerror = () => {
        errorCount++;
        // Si le serveur a fermé la connexion (ex: HTTP 204 sur PHP) ou après 2 échecs
        if (this.eventSource && (this.eventSource.readyState === EventSource.CLOSED || errorCount >= 2)) {
          this.disconnectEvents();
        }
      };
    } catch (err) {
      console.warn('[SSE] Impossible d\'initialiser EventSource :', err);
    }
  }

  disconnectEvents() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

export const api = new ApiService();
