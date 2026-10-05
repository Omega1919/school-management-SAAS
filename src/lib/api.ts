export const API_BASE = '/api';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem('sms_auth_token');
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem('sms_auth_token', token);
    } else {
      localStorage.removeItem('sms_auth_token');
    }
  } catch {}
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
  retries = 2
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (err: any) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return apiRequest<T>(endpoint, options, retries - 1);
    }
    throw err;
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  let data: any;
  try {
    data = isJson ? await response.json() : await response.text();
  } catch {
    data = null;
  }

  if (!response.ok) {
    let errorMsg = '';
    if (data && typeof data === 'object') {
      errorMsg = data.error || data.message || '';
    } else if (typeof data === 'string' && data.trim()) {
      if (data.includes('<html') || data.includes('<!DOCTYPE') || data.includes('<body') || data.includes('<h1')) {
        // Handle HTML error pages from gateways/proxies
        if (response.status === 403 || data.includes('403 Forbidden')) {
          errorMsg = 'Access Denied: You do not have authorization to access this portal with the provided credentials.';
        } else if (response.status === 401 || data.includes('401 Unauthorized')) {
          errorMsg = 'Authentication Failed: Invalid identification code or password. Please verify your details.';
        } else if (response.status === 404 || data.includes('404 Not Found')) {
          errorMsg = 'Account or resource was not found. Please verify your email or student/staff ID.';
        } else if (response.status === 429 || data.includes('429 Too Many Requests')) {
          errorMsg = 'Security Notice: Too many login attempts. Please wait a few minutes before trying again.';
        } else if (response.status >= 500) {
          errorMsg = 'The server is momentarily busy. Please refresh and try again shortly.';
        } else {
          errorMsg = 'Authentication request could not be processed. Please verify your credentials.';
        }
      } else {
        try {
          const parsed = JSON.parse(data);
          errorMsg = parsed.error || parsed.message || data;
        } catch {
          errorMsg = data;
        }
      }
    }

    if (!errorMsg) {
      if (response.status === 401) {
        errorMsg = 'Invalid credentials. Please verify your identification code or password.';
      } else if (response.status === 403) {
        errorMsg = 'Access Denied: You do not have authorization to access this portal with these credentials.';
      } else if (response.status === 404) {
        errorMsg = 'Account not found. Please verify your email / identifier.';
      } else if (response.status === 429) {
        errorMsg = 'Too many attempts. For security reasons, please wait a minute before trying again.';
      } else {
        errorMsg = response.statusText || 'Authentication request could not be processed.';
      }
    }

    throw new Error(errorMsg);
  }

  return data as T;
}
