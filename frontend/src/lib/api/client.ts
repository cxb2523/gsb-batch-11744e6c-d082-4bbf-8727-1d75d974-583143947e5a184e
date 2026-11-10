export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function handleUnauthorized(status: number) {
  if (status === 401) {
    // Token expired or invalid - redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}

// Build an Error that carries the backend's `detail` (FastAPI's error field) so
// callers can show the real reason (e.g. "Sprint must have start and end dates")
// instead of a generic status message. Falls back to a status line when the body
// is missing or not JSON. FastAPI validation errors (422) return `detail` as an
// array, so non-string details are stringified rather than shown raw.
async function errorFromResponse(res: Response, method: string, path: string): Promise<Error> {
  let message = `API ${method} ${path} failed with status ${res.status}`;
  try {
    const data = await res.json();
    if (data?.detail) {
      message = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    }
  } catch {
    // Body absent or not JSON — keep the default status message.
  }
  return new Error(message);
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    // always fresh data for app screens
    cache: 'no-store'
  });

  if (!res.ok) {
    handleUnauthorized(res.status);
    throw await errorFromResponse(res, 'GET', path);
  }

  return (await res.json()) as T;
}

export async function apiPost<TBody, TResp>(path: string, body: TBody, init?: RequestInit): Promise<TResp> {
  const url = `${API_BASE_URL}${path}`;

  // Check if body is FormData - if so, don't JSON.stringify and don't set Content-Type
  const isFormData = body instanceof FormData;

  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: isFormData ? {
      ...(init?.headers || {})
    } : {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    body: isFormData ? body : JSON.stringify(body),
    ...init
  });

  if (!res.ok) {
    handleUnauthorized(res.status);
    throw await errorFromResponse(res, 'POST', path);
  }

  return (await res.json()) as TResp;
}

export async function apiPut<TBody, TResp>(path: string, body: TBody, init?: RequestInit): Promise<TResp> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    body: JSON.stringify(body),
    ...init
  });

  if (!res.ok) {
    handleUnauthorized(res.status);
    throw await errorFromResponse(res, 'PUT', path);
  }

  return (await res.json()) as TResp;
}

export async function apiPatch<TBody, TResp>(path: string, body: TBody, init?: RequestInit): Promise<TResp> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    },
    body: JSON.stringify(body),
    ...init
  });

  if (!res.ok) {
    handleUnauthorized(res.status);
    throw await errorFromResponse(res, 'PATCH', path);
  }

  return (await res.json()) as TResp;
}

export async function apiDelete(path: string, init?: RequestInit): Promise<void> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    method: 'DELETE',
    credentials: 'include',
    ...init
  });

  if (!res.ok) {
    handleUnauthorized(res.status);
    throw await errorFromResponse(res, 'DELETE', path);
  }
}

// API Client object for compatibility with axios-style API modules
export const apiClient = {
  async get<T>(path: string, config?: RequestInit): Promise<{ data: T }> {
    const data = await apiGet<T>(path, config);
    return { data };
  },

  async post<TReq = any, TResp = any>(path: string, body?: TReq, config?: RequestInit): Promise<{ data: TResp }> {
    const data = await apiPost<TReq, TResp>(path, body as TReq, config);
    return { data };
  },

  async put<TReq = any, TResp = any>(path: string, body?: TReq, config?: RequestInit): Promise<{ data: TResp }> {
    const data = await apiPut<TReq, TResp>(path, body as TReq, config);
    return { data };
  },

  async patch<TReq = any, TResp = any>(path: string, body?: TReq, config?: RequestInit): Promise<{ data: TResp }> {
    const data = await apiPatch<TReq, TResp>(path, body as TReq, config);
    return { data };
  },

  async delete(path: string, config?: RequestInit): Promise<void> {
    await apiDelete(path, config);
  }
};

