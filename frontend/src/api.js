const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export async function api(path, options = {}) {
  const token = localStorage.getItem('mws_token');

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || `Request failed (${res.status})`);
  }

  return data;
}

// Fetch public hazard reports without attaching a saved login token.
// The backend GET /api/hazards endpoint must allow anonymous reads.
export async function getHazards() {
  const res = await fetch(`${API}/api/hazards`, { headers: { Accept: 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}

// Submit a new hazard report
export async function submitHazardReport(report) {
  return api('/api/reports', {
    method: 'POST',
    body: JSON.stringify(report),
  });
}

// Register a new user
export async function registerUser(user) {
  return api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

// Log in an existing user
export async function loginUser(credentials) {
  const result = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

  if (result.token) {
    localStorage.setItem('mws_token', result.token);
  }

  return result;
}

// Log out the current user
export function logoutUser() {
  localStorage.removeItem('mws_token');
}