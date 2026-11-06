import { API_URL } from '@/config/app.config';

export type Gender = 'male' | 'female';

/** The logged-in user, as returned by the server (server/src/users.ts → meUser). */
export type Me = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  gender: Gender;
  username: string | null;
  bio: string;
  photoURL: string | null;
  isFainet: boolean;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  postsCount: number;
  email: string;
  birthday: string;
  profileComplete: boolean;
};

export type AuthResult = { token: string; user: Me };

/** Error from the server: `reason` is a stable code, `details` carries extras (remaining, wait, message). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public details: Record<string, any> = {},
  ) {
    super(reason);
  }
}

let authToken: string | null = null;
/** Called by AuthProvider whenever the token changes. */
export function setApiToken(token: string | null) {
  authToken = token;
}

let onUnauthorized: (() => void) | null = null;
/** AuthProvider registers this so an expired/revoked session logs the user out. */
export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), isForm ? 60_000 : 20_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network');
  } finally {
    clearTimeout(timeout);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!res.ok) {
    const { error, ...details } = data ?? {};
    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, error ?? 'internal', details);
  }
  return data as T;
}

export const api = {
  sendCode: (email: string, purpose: 'signup' | 'reset') =>
    request<{ ok: true }>('POST', '/v1/auth/send-code', { email, purpose }),

  signup: (data: {
    email: string;
    code: string;
    password: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    birthday: string;
  }) => request<AuthResult>('POST', '/v1/auth/signup', data),

  login: (email: string, password: string) => request<AuthResult>('POST', '/v1/auth/login', { email, password }),

  resetPassword: (email: string, code: string, newPassword: string) =>
    request<AuthResult>('POST', '/v1/auth/reset', { email, code, newPassword }),

  logout: () => request<{ ok: true }>('POST', '/v1/auth/logout'),

  me: () => request<{ user: Me }>('GET', '/v1/me'),

  claimUsername: (username: string, bio: string) =>
    request<{ user: Me }>('POST', '/v1/me/username', { username, bio }),

  uploadAvatar: (localUri: string) => {
    const form = new FormData();
    // React Native's FormData accepts { uri, name, type } for local files.
    form.append('file', { uri: localUri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
    return request<{ user: Me }>('POST', '/v1/me/avatar', form, true);
  },
};

/** Turns any error into a Pashto message for the user. */
export function errorMessage(e: unknown): string {
  const err = e instanceof ApiError ? e : new ApiError(0, 'internal');
  const d = err.details;
  switch (err.reason) {
    case 'invalid-code':
      return d.remaining ? `کوډ غلط دی. ${d.remaining} هڅې پاتې دي` : 'کوډ غلط دی';
    case 'code-expired':
      return 'کوډ ختم شوی. نوی کوډ وغواړئ';
    case 'too-many-attempts':
      return 'ډېرې غلطې هڅې وشوې. نوی کوډ وغواړئ';
    case 'resend-wait':
      return `لطفاً ${d.wait ?? 60} ثانیې صبر وکړئ`;
    case 'rate-limited':
      return 'ډېرې هڅې وشوې. لږ وروسته بیا هڅه وکړئ';
    case 'email-in-use':
      return 'دا ایمیل مخکې ثبت شوی. Login وکړئ';
    case 'weak-password':
      return 'پاسورډ کمزوری دی';
    case 'too-young':
      return 'د حساب جوړولو لپاره باید لږ تر لږه ۱۳ کلن یاست';
    case 'username-taken':
      return 'دا ID Name بل چا اخیستی';
    case 'username-invalid':
      return 'ID Name سم نه دی';
    case 'invalid-credentials':
      return 'ایمیل یا پاسورډ غلط دی';
    case 'account-disabled':
      return 'دا حساب بند شوی';
    case 'invalid-image':
      return 'دا عکس نه منل کېږي. بل عکس وټاکئ';
    case 'image-too-big':
      return 'عکس ډېر لوی دی (تر 5MB کم)';
    case 'email-send-failed':
      return 'ایمیل ونه لېږل شو. بیا هڅه وکړئ';
    case 'invalid-input':
      return d.message ?? 'معلومات سم نه دي';
    case 'unauthenticated':
      return 'بیا Login وکړئ';
    case 'network':
      return 'سرور ته نه رسېږو. انټرنېټ وګورئ او بیا هڅه وکړئ';
    default:
      return 'یوه ستونزه پېښه شوه. بیا هڅه وکړئ';
  }
}
