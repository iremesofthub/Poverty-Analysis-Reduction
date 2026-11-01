/**
 * API Client for Ireme Insight Engine
 * Connects frontend to the backend API (engine/ireme/api.py)
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
const LOCAL_API_BASE = '/__local/investigations';

class ApiClient {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new ApiError(response.status, error.error_code || 'ERROR', error.message || 'Request failed');
    }

    return response.json();
  }

  // Authentication
  async login(email, password) {
    // This would connect to Supabase or your auth provider
    // For now, we use the demo auth
    return { user: null, session: null };
  }

  async logout() {
    this.clearToken();
  }

  // Investigation API
  async createInvestigation(district) {
    return this.request('/investigations/run', {
      method: 'POST',
      body: JSON.stringify({ district }),
    });
  }

  async getInvestigation(id) {
    return this.request(`/investigations/${id}`);
  }

  async getInvestigationHistory() {
    return this.request('/investigations/history');
  }

  async getInvestigationState(id) {
    return this.request(`/investigations/run/${id}`);
  }

  async resumeInvestigation(id) {
    return this.request(`/investigations/resume/${id}`, { method: 'POST' });
  }

  async getInvestigationResult(id) {
    return this.request(`/investigations/result/${id}`);
  }

  async getInvestigationCatalog(id, query = '', page = 1) {
    return this.request(`/investigations/catalog/${id}?q=${encodeURIComponent(query)}&page=1`);
  }

  async getInvestigationReport(id, format = 'pdf') {
    const response = await fetch(`${LOCAL_API_BASE}/report/${id}/${format}`);
    if (!response.ok) throw new Error('Report not ready');
    return response.blob();
  }

  async uploadFile(id, file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${LOCAL_API_BASE}/upload/${id}?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    if (!response.ok) throw new Error('Upload failed');
    return response.json();
  }

  async addSource(id, url) {
    return this.request(`/investigations/sources/${id}`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  async getSources(id) {
    return this.request(`/investigations/sources/${id}`);
  }

  async deleteSource(id, sourceId) {
    return this.request(`/investigations/sources/${id}/${sourceId}`, { method: 'DELETE' });
  }

  async addChatMessage(id, message) {
    return this.request(`/investigations/chat/${id}`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getChatHistory(id) {
    return this.request(`/investigations/chat/${id}`);
  }

  async organizeNotebook(id) {
    return this.request(`/investigations/notebook/${id}/organize`, { method: 'POST' });
  }

  async getNotebook(id) {
    return this.request(`/investigations/notebook/${id}`);
  }

  // Report API
  async reviewReport(reportId, version, decision, reason, reportAstSha256) {
    return this.request(`/reports/${reportId}/review`, {
      method: 'POST',
      body: JSON.stringify({ version, decision, reason, report_ast_sha256 }),
    });
  }

  async publishReport(reportId, version) {
    return this.request(`/reports/${reportId}/publish`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  }

  async exportReport(reportId, version, format = 'pdf') {
    const response = await fetch(`${this.baseUrl}/reports/${reportId}/export?version=${version}&format=${format}`, {
      headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  }

  // Agent API
  async runAgent(runId, role, question, district, maxSteps = 6, maxRepairs = 2) {
    return this.request(`/investigations/${runId}/agent-proposals`, {
      method: 'POST',
      body: JSON.stringify({ role, question, district, maxSteps, maxRepairs }),
    });
  }

  // MFA Admin
  async getMfaStatus() {
    return this.request('/admin/mfa/status');
  }

  async toggleMfa(enabled) {
    return this.request('/admin/mfa/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  async getBypassStatus() {
    return this.request('/admin/bypass/status');
  }

  async toggleBypass(options) {
    return this.request('/admin/bypass/toggle', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// React hook for using the API client
export function useApiClient() {
  return apiClient;
}

export { ApiError };
export default apiClient;