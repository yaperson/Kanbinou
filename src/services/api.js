// =============================================================================
// Kanbinou - Service Client API & Temps Réel (SSE)
// =============================================================================

const API_BASE = '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('kanbinou_token') || null;
    this.eventSource = null;
    this.listeners = new Map();
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('kanbinou_token', token);
    } else {
      localStorage.removeItem('kanbinou_token');
    }
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
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

    const response = await fetch(url, config);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Erreur serveur (${response.status})`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // --- Auth ---
  async login(username, password) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: { username, password }
    });
    this.setToken(res.token);
    return res;
  }

  async register(username, password, displayName) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: { username, password, displayName }
    });
    this.setToken(res.token);
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
    return this.request(`/allocations/${id}`, { method: 'DELETE' });
  }

  // --- Configuration ---
  async getConfig() {
    return this.request('/config');
  }

  async saveConfig(config) {
    return this.request('/config', { method: 'POST', body: config });
  }

  // --- Temps Réel : Server-Sent Events (SSE) ---
  connectEvents(onEventCallback) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`${API_BASE}/events`);

    this.eventSource.onmessage = (event) => {
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
      console.warn('[SSE] Connexion interrompue, reconnexion automatique...');
    };
  }

  disconnectEvents() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

export const api = new ApiService();
