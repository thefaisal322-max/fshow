import { httpsCallable } from 'firebase/functions';

import { functions } from './firebase';

/** Calls a Cloud Function (see firebase/functions/src/index.ts). */
export async function callFn<T = { ok: boolean }>(name: string, data: unknown): Promise<T> {
  const fn = httpsCallable(functions, name);
  const res = await fn(data);
  return res.data as T;
}

export type Gender = 'male' | 'female';

export const api = {
  sendCode: (email: string, purpose: 'signup' | 'reset') => callFn('sendCode', { email, purpose }),
  verifySignup: (data: {
    email: string;
    code: string;
    password: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    birthday: string;
  }) => callFn('verifySignup', data),
  resetPassword: (email: string, code: string, newPassword: string) =>
    callFn('resetPassword', { email, code, newPassword }),
  claimUsername: (username: string, bio: string) => callFn('claimUsername', { username, bio }),
};

/** Turns any Firebase / Functions error into a Pashto message for the user. */
export function errorMessage(e: any): string {
  const reason: string | undefined = e?.details?.reason ?? e?.code;
  const d = e?.details ?? {};
  switch (reason) {
    case 'invalid-code':
      return `کوډ غلط دی. ${d.remaining ?? ''} هڅې پاتې دي`;
    case 'code-expired':
      return 'کوډ ختم شوی. نوی کوډ وغواړئ';
    case 'too-many-attempts':
      return 'ډېرې غلطې هڅې وشوې. نوی کوډ وغواړئ';
    case 'resend-wait':
      return `لطفاً ${d.wait ?? 60} ثانیې صبر وکړئ`;
    case 'rate-limited':
    case 'auth/too-many-requests':
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
    case 'email-send-failed':
      return 'ایمیل ونه لېږل شو. بیا هڅه وکړئ';
    case 'invalid-input':
      return d.message ?? 'معلومات سم نه دي';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'ایمیل یا پاسورډ غلط دی';
    case 'auth/user-disabled':
      return 'دا حساب بند شوی';
    case 'auth/network-request-failed':
    case 'functions/unavailable':
    case 'unavailable':
      return 'انټرنېټ وګورئ او بیا هڅه وکړئ';
    default:
      return 'یوه ستونزه پېښه شوه. بیا هڅه وکړئ';
  }
}
