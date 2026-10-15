/**
 * Centralized API client with credentials, CSRF header attachment, and uniform error handling.
 */

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)airgrid_csrf=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrfToken);
    }
  }

  // Set default JSON Content-Type if body is string and not FormData
  if (
    options.body &&
    typeof options.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        errorDetail = errJson.detail;
      }
    } catch {
      // fallback to status text
      if (response.statusText) {
        errorDetail = response.statusText;
      }
    }
    throw new Error(errorDetail);
  }

  return response.json();
}
