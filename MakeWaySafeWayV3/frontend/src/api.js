const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
export async function api(path, options = {}) {
  const token = localStorage.getItem('mws_token');
  const res = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
  return data;
}
