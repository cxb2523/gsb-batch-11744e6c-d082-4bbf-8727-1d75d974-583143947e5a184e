import { API_BASE_URL } from './client';

/** Shown only when the local build opts in; the backend independently refuses outside local dev. */
export const DEV_LOGIN_ENABLED = process.env.NEXT_PUBLIC_DEV_LOGIN === 'true';

export type DevLoginResult = 'ok' | 'invalid' | 'disabled' | 'offline' | 'error';

/**
 * Local-only email/password sign-in. Calls fetch directly instead of apiPost because
 * here a 401 means "wrong credentials", not an expired session, so it must not
 * trigger the client's redirect-to-login.
 */
export async function devLogin(email: string, password: string): Promise<DevLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/dev-login`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('Dev login request failed', error);
    return 'offline';
  }
  if (res.ok) return 'ok';
  if (res.status === 401 || res.status === 422) return 'invalid';
  if (res.status === 404) return 'disabled';
  console.error('Dev login failed with status', res.status);
  return 'error';
}

export type LoginResult =
  | { status: 'ok'; mustChangePassword: boolean }
  | { status: 'invalid' | 'offline' | 'error' };

/**
 * Email/password sign-in for admin-provisioned accounts. Uses fetch directly (not apiPost)
 * because a 401 here means "wrong credentials", not an expired session, so it must not
 * trigger the client's global redirect-to-login.
 */
export async function login(email: string, password: string, rememberMe = false): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember_me: rememberMe }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('Login request failed', error);
    return { status: 'offline' };
  }
  if (res.ok) {
    const body = await res.json().catch(() => ({}));
    return { status: 'ok', mustChangePassword: Boolean(body?.must_change_password) };
  }
  if (res.status === 401 || res.status === 422) return { status: 'invalid' };
  console.error('Login failed with status', res.status);
  return { status: 'error' };
}

export type ChangePasswordResult =
  | { status: 'ok' }
  | { status: 'invalid'; message?: string }
  | { status: 'offline' | 'error' };

/**
 * Change the signed-in user's password. Raw fetch (not apiPost) so a 401 "current password
 * is incorrect" is shown inline rather than bouncing the user to /login.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('Change-password request failed', error);
    return { status: 'offline' };
  }
  if (res.ok) return { status: 'ok' };
  if (res.status === 401 || res.status === 400 || res.status === 422) {
    let message: string | undefined;
    try {
      const body = await res.json();
      message = body?.detail;
    } catch {
      /* ignore */
    }
    return { status: 'invalid', message };
  }
  return { status: 'error' };
}
