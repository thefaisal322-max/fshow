import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError } from './api';
import type { Author, PostPreview } from './social';
import { supabase } from './supabase';

export const REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'] as const;
export type Reaction = (typeof REACTIONS)[number];

export type Conversation = {
  id: string;
  is_group: boolean;
  title: string | null;
  last_message_at: string;
  last_message_preview: string;
  last_sender_id: string | null;
  archived: boolean;
  muted: boolean;
  unread: number;
  members: Author[] | null; // everyone except me
  member_count: number;
  my_role: 'admin' | 'member';
};

export type Message = {
  id: string;
  sender_id: string;
  body: string;
  media_path: string | null;
  media_type: 'image' | 'video' | 'audio' | null;
  view_once: boolean;
  opened: boolean;
  deleted: boolean;
  created_at: string;
  once_media: 'image' | 'video' | null;
  reply: { id: string; sender_id: string; deleted: boolean; body: string; media_type: string | null } | null;
  reactions: Record<string, number>;
  my_reaction: Reaction | null;
  sender: Author;
  post: PostPreview | null;
};

export type Attachment = { uri: string; type: 'image' | 'video' | 'audio'; mime?: string | null; size?: number | null };

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['rate-limited', 'already-opened', 'forbidden', 'invalid-input', 'unauthenticated', 'blocked']) {
      if (msg.includes(r)) throw new ApiError(r);
    }
    if (/fetch|network/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

export function chatTitle(c: Conversation, fallback: string): string {
  if (c.is_group) return c.title ?? fallback;
  const o = c.members?.[0];
  return o ? `${o.first_name} ${o.last_name}` : fallback;
}

// Signed links for private chat files, cached for 50 minutes.
const signed = new Map<string, { url: string; until: number }>();
export async function chatFileUrl(path: string): Promise<string | null> {
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabase.storage.from('chats').createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  if (!path.includes('/once/')) signed.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60_000 });
  return data.signedUrl;
}

async function uploadAttachment(convId: string, a: Attachment, once: boolean): Promise<string> {
  const folder = once ? `${convId}/once` : convId;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  if (a.type === 'image') {
    const img = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: 1280 } }], {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const bytes = await (await fetch(img.uri)).arrayBuffer();
    const path = `${folder}/${id}.jpg`;
    const up = await supabase.storage.from('chats').upload(path, bytes, { contentType: 'image/jpeg' });
    if (up.error) throw new ApiError('upload-failed');
    return path;
  }
  if (a.type === 'audio') {
    // voice message recorded by the app (AAC in an .m4a file)
    const bytes = await (await fetch(a.uri)).arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new ApiError('image-too-big');
    const path = `${folder}/${id}.m4a`;
    const up = await supabase.storage.from('chats').upload(path, bytes, { contentType: 'audio/mp4' });
    if (up.error) throw new ApiError('upload-failed');
    return path;
  }
  const bytes = await (await fetch(a.uri)).arrayBuffer();
  if (bytes.byteLength > 25 * 1024 * 1024) throw new ApiError('video-too-big');
  const mime = a.mime && a.mime.startsWith('video/') ? a.mime : 'video/mp4';
  const path = `${folder}/${id}.${mime === 'video/quicktime' ? 'mov' : 'mp4'}`;
  const up = await supabase.storage.from('chats').upload(path, bytes, { contentType: mime });
  if (up.error) throw new ApiError(/size|large/i.test(up.error.message) ? 'video-too-big' : 'upload-failed');
  return path;
}

export const chat = {
  list: async (archived = false) => check<Conversation[]>(await supabase.rpc('get_conversations', { p_archived: archived })) ?? [],
  messages: async (convId: string, before?: string) =>
    check<Message[]>(await supabase.rpc('get_messages', { p_conv: convId, p_before: before ?? null, p_limit: 40 })) ?? [],
  unread: async () => check<number>(await supabase.rpc('unread_chats')) ?? 0,
  startDirect: async (userId: string) => check<string>(await supabase.rpc('start_direct_chat', { p_other: userId })),
  createGroup: async (title: string, members: string[]) =>
    check<string>(await supabase.rpc('create_group_chat', { p_title: title, p_members: members })),
  addMembers: async (convId: string, members: string[]) => {
    check(await supabase.rpc('add_group_members', { p_conv: convId, p_members: members }));
  },
  leave: async (convId: string) => {
    check(await supabase.rpc('leave_group_chat', { p_conv: convId }));
  },
  markRead: async (convId: string) => {
    await supabase.rpc('mark_chat_read', { p_conv: convId });
  },
  mute: async (convId: string, muted: boolean) => {
    check(await supabase.rpc('set_chat_muted', { p_conv: convId, p_muted: muted }));
  },
  /** Deletes the history for me only. */
  deleteForMe: async (convId: string) => {
    check(await supabase.rpc('delete_chat_for_me', { p_conv: convId }));
  },
  archive: async (convId: string, archived: boolean) => {
    check(await supabase.rpc('set_chat_archived', { p_conv: convId, p_archived: archived }));
  },

  send: async (convId: string, input: { body: string; attachment?: Attachment | null; replyTo?: string | null; viewOnce?: boolean }) => {
    const once = !!input.viewOnce && input.attachment?.type !== 'audio';
    const media = input.attachment ? await uploadAttachment(convId, input.attachment, once) : null;
    if (once) {
      check(
        await supabase.rpc('send_view_once', {
          p_conv: convId,
          p_body: input.body.trim(),
          p_media_path: media,
          p_media_type: media ? input.attachment!.type : null,
        }),
      );
      return;
    }
    const r = await supabase.from('messages').insert({
      conversation_id: convId,
      body: input.body.trim(),
      media_path: media,
      media_type: media ? input.attachment!.type : null,
      reply_to: input.replyTo ?? null,
    });
    if (r.error) {
      if (media) await supabase.storage.from('chats').remove([media]);
      check(r);
    }
  },

  /** Deletes for everyone; also removes the file. */
  remove: async (messageId: string) => {
    const path = check<string | null>(await supabase.rpc('delete_message', { p_message: messageId }));
    if (path) await supabase.storage.from('chats').remove([path]);
  },

  react: async (messageId: string, emoji: Reaction | null, me: string) => {
    if (!emoji) {
      check(await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', me));
      return;
    }
    const ins = await supabase.from('message_reactions').insert({ message_id: messageId, emoji });
    if (ins.error?.code === '23505') {
      check(await supabase.from('message_reactions').update({ emoji }).eq('message_id', messageId).eq('user_id', me));
    } else if (ins.error) check(ins);
  },

  /** Opens a view-once message (only once) and returns its content. */
  openOnce: async (messageId: string) => {
    const r = check<{ body: string; media_path: string | null; media_type: 'image' | 'video' | null }>(
      await supabase.rpc('open_view_once', { p_message: messageId }),
    );
    const url = r.media_path ? await chatFileUrl(r.media_path) : null;
    return { body: r.body, mediaType: r.media_type, url };
  },
};

export type ChatMember = Author & {
  role: 'admin' | 'member';
  last_read_at: string;
  followed_by_me: boolean;
  follows_me: boolean;
  blocked_by_me: boolean;
  blocked_me: boolean;
};

export type ChatInfo = {
  id: string;
  is_group: boolean;
  title: string | null;
  created_at: string;
  muted: boolean;
  my_role: 'admin' | 'member';
  members: ChatMember[] | null; // everyone except me
};

/** Header info: members, mute, others' read time ("Seen"), friendship and block state. */
export async function chatInfo(convId: string): Promise<ChatInfo | null> {
  return check<ChatInfo | null>(await supabase.rpc('get_chat_info', { p_conv: convId }));
}
