import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError } from './api';
import type { Author } from './social';
import { supabase } from './supabase';

export type Challenge = {
  id: number;
  stage: 'qualify' | 'earn';
  kind: 'proof' | 'auto';
  metric: string;
  target: number;
  status: 'pending' | 'approved' | 'rejected' | 'done' | null;
  note: string | null;
  proof_text: string | null;
};

export type Payout = { id: string; amount: number; method: string; status: 'pending' | 'paid' | 'rejected'; created_at: string };

export type Monetization = {
  qualified: boolean;
  is_admin: boolean;
  reward_every: number;
  reward_afs: number;
  min_payout: number;
  earn_done: number;
  earn_total: number;
  earned_afs: number;
  balance_afs: number;
  metrics: Record<string, number>;
  challenges: Challenge[];
  payouts: Payout[];
};

export type PendingProof = { user: Author; challenge_id: number; metric: string; proof_text: string; proof_path: string | null; created_at: string };
export type PendingPayout = { id: string; user: Author; amount: number; method: string; account: string; created_at: string };

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['not-eligible', 'forbidden', 'invalid-input', 'rate-limited', 'unauthenticated']) if (msg.includes(r)) throw new ApiError(r);
    if (/fetch|network|abort/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

export const isDone = (c: Challenge) => c.status === 'done' || c.status === 'approved';

export const monetize = {
  get: async () => check<Monetization>(await supabase.rpc('get_monetization')),

  /** Text (e.g. email) and/or a screenshot; the screenshot goes to the private "proofs" bucket. */
  submitProof: async (uid: string, challengeId: number, text: string, imageUri: string | null) => {
    let path: string | null = null;
    if (imageUri) {
      const img = await ImageManipulator.manipulateAsync(imageUri, [{ resize: { width: 1080 } }], {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const bytes = await (await fetch(img.uri)).arrayBuffer();
      path = `${uid}/${challengeId}-${Date.now().toString(36)}.jpg`;
      const up = await supabase.storage.from('proofs').upload(path, bytes, { contentType: 'image/jpeg' });
      if (up.error) throw new ApiError('upload-failed');
    }
    check(await supabase.rpc('submit_challenge_proof', { p_challenge: challengeId, p_text: text, p_path: path }));
  },

  requestPayout: async (amount: number, method: string, account: string) => {
    check(await supabase.rpc('request_payout', { p_amount: amount, p_method: method, p_account: account }));
  },

  // admin
  pending: async () => check<{ proofs: PendingProof[]; payouts: PendingPayout[] }>(await supabase.rpc('admin_pending')),
  review: async (userId: string, challengeId: number, approve: boolean, note = '') => {
    check(await supabase.rpc('admin_review_proof', { p_user: userId, p_challenge: challengeId, p_approve: approve, p_note: note }));
  },
  setPayout: async (id: string, paid: boolean) => {
    check(await supabase.rpc('admin_set_payout', { p_id: id, p_paid: paid }));
  },
  proofUrl: async (path: string) => (await supabase.storage.from('proofs').createSignedUrl(path, 600)).data?.signedUrl ?? null,
};

/** "1.5K" style without decimals noise. */
export const afs = (n: number) => `${n.toLocaleString('en-US')} AFS`;
