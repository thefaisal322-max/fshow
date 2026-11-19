import * as ImageManipulator from 'expo-image-manipulator';

import { StringKey } from '@/i18n';

import { ApiError } from './api';
import type { Author } from './social';
import { supabase } from './supabase';

/** Fshow Coins (FC): 1000 FC = 100 AFS. */
export const FC_PER_AFS = 10;
export const HESABPAY_NUMBER = '0711940975';
export const BUY_MIN = 50;
export const BUY_MAX = 50000;
export const BUY_QUICK = [50, 100, 500, 1000, 2500, 5000, 10000, 50000];
export const PAYOUT_MIN = 25;
export const PAYOUT_MAX = 10000;
export const MONETIZE_PRICE = 2500;

export type GiftCode = 'bronze_watch' | 'yellow_flower' | 'gold_watch' | 'bird' | 'rose' | 'smart_gift' | 'tiger' | 'fplus';

export const GIFTS: { code: GiftCode; price: number; emoji: string; label: StringKey; color: string }[] = [
  { code: 'bronze_watch', price: 100, emoji: '⌚', label: 'g_bronze_watch', color: '#CD7F32' },
  { code: 'yellow_flower', price: 200, emoji: '🌼', label: 'g_yellow_flower', color: '#F7C600' },
  { code: 'gold_watch', price: 300, emoji: '⌚', label: 'g_gold_watch', color: '#FFC107' },
  { code: 'bird', price: 500, emoji: '🐦', label: 'g_bird', color: '#2D9CDB' },
  { code: 'rose', price: 500, emoji: '🌹', label: 'g_rose', color: '#E0245E' },
  { code: 'smart_gift', price: 1000, emoji: '🎁', label: 'g_smart_gift', color: '#9B51E0' },
  { code: 'tiger', price: 1000, emoji: '🐯', label: 'g_tiger', color: '#F2994A' },
  { code: 'fplus', price: 1290, emoji: '✨', label: 'g_fplus', color: '#D63AF9' },
];
export const giftOf = (code: string) => GIFTS.find((g) => g.code === code) ?? GIFTS[0];

export type Wallet = {
  balance: number;
  /** admins: coins never run out */
  unlimited: boolean;
  spent: number;
  earned: number;
  cashable: number;
  foru_left: number;
  fplus_until: string | null;
  discount9: boolean;
  daily_gift: GiftCode;
  birthday_ready: boolean;
  monetized: boolean;
  purchases: { id: string; coins: number; afs: number; status: 'pending' | 'approved' | 'rejected'; created_at: string }[];
  payouts: { id: string; coins: number; afs: number; phone: string; status: 'pending' | 'paid' | 'rejected'; created_at: string }[];
  history: { delta: number; kind: string; created_at: string }[];
};

export type Promotion = {
  id: string;
  post_id: string;
  kind: 'likes' | 'plays' | 'views';
  target: number;
  done: number;
  coins: number;
  until: string;
  created_at: string;
  body: string;
  thumb_path: string | null;
  image_path: string | null;
};

export type CoinRequest = {
  id: string;
  kind: 'buy' | 'payout';
  coins: number;
  afs: number;
  receipt_path?: string;
  note?: string;
  phone?: string;
  status: string;
  created_at: string;
  user: Author;
};

/** what one unit (100 FC) of a promotion brings */
export const PROMO_UNIT: Record<Promotion['kind'], number> = { likes: 150, plays: 100, views: 300 };

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['not-enough-coins', 'not-eligible', 'forbidden', 'invalid-input', 'rate-limited', 'unauthenticated']) {
      if (msg.includes(r)) throw new ApiError(r);
    }
    if (/fetch|network|abort/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

/** price after the best offer (20 % gift of the day, else 9 % after 1,000 FC spent) — the server decides the real price */
export function offerPrice(w: Wallet | null, base: number, gift?: GiftCode): number {
  if (!w) return base;
  if (gift && gift === w.daily_gift) return Math.ceil(base * 0.8);
  if (w.discount9) return Math.ceil(base * 0.91);
  return base;
}

export const fcToAfs = (fc: number) => Math.round((fc / FC_PER_AFS) * 10) / 10;

/** "fshow://post/ID", ".../p/?id=ID" or a bare id → the post id */
export function postIdFromLink(text: string): string | null {
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(text.trim());
  return m ? m[1].toLowerCase() : null;
}

export const coins = {
  wallet: async () => check<Wallet>(await supabase.rpc('get_wallet')),
  claimBirthday: async () => check<boolean>(await supabase.rpc('claim_birthday_coins')),

  /** the HesabPay receipt goes to the private "receipts" bucket; an admin checks it */
  buy: async (uid: string, amount: number, receiptUri: string, note = '') => {
    const img = await ImageManipulator.manipulateAsync(receiptUri, [{ resize: { width: 1080 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const bytes = await (await fetch(img.uri)).arrayBuffer();
    const path = `${uid}/${Date.now().toString(36)}.jpg`;
    const up = await supabase.storage.from('receipts').upload(path, bytes, { contentType: 'image/jpeg' });
    if (up.error) throw new ApiError('upload-failed');
    return check<string>(await supabase.rpc('request_coins', { p_coins: amount, p_receipt: path, p_note: note }));
  },

  /** the HesabPay number used last time */
  myHesabpay: async () => check<string | null>(await supabase.rpc('my_hesabpay')),
  cashOut: async (afs: number, phone: string) => {
    check(await supabase.rpc('request_fc_payout', { p_afs: afs, p_phone: phone }));
  },

  sendGift: async (to: string, gift: GiftCode, postId?: string | null, liveId?: string | null) =>
    check<{ id: string; price: number; balance: number }>(
      await supabase.rpc('send_gift', { p_to: to, p_gift: gift, p_post: postId ?? null, p_live: liveId ?? null }),
    ),

  promote: async (postId: string, kind: Promotion['kind'], units: number) =>
    check<{ id: string; price: number; target: number; balance: number }>(await supabase.rpc('promote_post', { p_post: postId, p_kind: kind, p_units: units })),
  myPromotions: async () => check<Promotion[]>(await supabase.rpc('my_promotions')) ?? [],

  monetizeWithCoins: async (phone: string) => check<string>(await supabase.rpc('monetize_with_coins', { p_phone: phone })),

  // admin
  requests: async () => check<CoinRequest[]>(await supabase.rpc('admin_coin_requests')) ?? [],
  decideBuy: async (id: string, approve: boolean) => {
    check(await supabase.rpc('admin_decide_coins', { p_id: id, p_approve: approve }));
  },
  decidePayout: async (id: string, paid: boolean) => {
    check(await supabase.rpc('admin_decide_payout', { p_id: id, p_paid: paid }));
  },
  receiptUrl: async (path: string) => (await supabase.storage.from('receipts').createSignedUrl(path, 600)).data?.signedUrl ?? null,
};
