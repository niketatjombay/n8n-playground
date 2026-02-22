export async function apiFetch(url: string, options: RequestInit = {}) {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('playground-api-key') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return fetch(url, { ...options, headers });
}
