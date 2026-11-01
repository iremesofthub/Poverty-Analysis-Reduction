import { useState, useCallback, useEffect } from 'react';

export function useEngineApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);

  const request = useCallback(async (endpoint, options = {}) => {
    const token = localStorage.getItem('engine_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/v1${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }, []);

  const setTokenValue = useCallback((t) => {
    localStorage.setItem('engine_token', t);
    setToken(t);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem('engine_token');
    setToken(null);
  }, []);

  // Engine API methods
  const api = {
    // Health check
    health: () => fetch('/api/v1/health').then(r => r.ok),

    // Investigation API
    investigations: {
      list: () => fetch('/api/v1/investigations/history').then(r => r.json()),
      create: (district) => fetch('/api/v1/investigations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('engine_token')}` },
        body: JSON.stringify({ district }),
      }).then(r => r.json()),
      get: (id) => fetch(`/api/v1/investigations/${id}`).then(r => r.json()),
      getState: (id) => fetch(`/api/v1/investigations/run/${id}`).then(r => r.json()),
      resume: (id) => fetch(`/api/v1/investigations/resume/${id}`, { method: 'POST' }).then(r => r.json()),
      getResult: (id) => fetch(`/api/v1/investigations/result/${id}`).then(r => r.json()),
      getCatalog: (id, query = '', page = 1) => fetch(`/api/v1/investigations/catalog/${id}?q=${encodeURIComponent(query)}&page=1`).then(r => r.json()),
      getReport: (id, format = 'pdf') => fetch(`/api/v1/investigations/report/${id}/${format}`).then(r => r.blob()),
    },

    // Agent API
    agent: {
      run: (runId, role, question, district, maxSteps = 6, maxRepairs = 2) =>
        fetch('/api/v1/investigations/agent-proposals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('engine_token')}` },
          body: JSON.stringify({ runId, role, question, district, maxSteps, maxRepairs }),
        }).then(r => r.json()),
    },

    // Report API
    reports: {
      review: (reportId, version, decision, reason, reportAstSha256) =>
        fetch(`/api/v1/reports/${reportId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('engine_token')}` },
          body: JSON.stringify({ version, decision, reason, report_ast_sha256 }),
        }).then(r => r.json()),
      publish: (id, version) => fetch(`/api/v1/reports/${id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('engine_token')}` },
        body: JSON.stringify({ version }),
      }).then(r => r.json()),
      export: (id, version, format = 'pdf') => fetch(`/api/v1/reports/${id}/export?version=${version}&format=${format}`).then(r => r.blob()),
    },

    // Admin
    admin: {
      mfaStatus: () => fetch('/api/v1/admin/mfa/status').then(r => r.json()),
      toggleMfa: (enabled) => fetch('/api/v1/admin/mfa/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }).then(r => r.json()),
    },
  };

  return { api, loading: false, error: null };
}

export default useEngineApi;