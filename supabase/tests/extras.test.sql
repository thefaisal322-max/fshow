-- Comment hearts, reposts, send post in chat, blocks, mute, delete chat for me, read info.
-- Runs after the other tests (A fainet, C karim, D dawood; A↔C have a DM).
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'SECURITY HOLE: % succeeded', label;
EXCEPTION
  WHEN raise_exception THEN RAISE;
  WHEN OTHERS THEN RAISE NOTICE 'ok (blocked): % → %', label, SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'FAILED: %', label; END IF; RAISE NOTICE 'ok: %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO anon, authenticated;
CREATE TEMP TABLE x (k text PRIMARY KEY, v uuid);
GRANT ALL ON x TO authenticated;

SET ROLE authenticated;

-- C writes a post; D comments; A hearts D's comment
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.posts (body) VALUES ('د شریکولو پوسټ');
INSERT INTO x SELECT 'post', id FROM public.posts WHERE body = 'د شریکولو پوسټ';
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO public.comments (post_id, body) SELECT v, '😂😂' FROM x WHERE k = 'post';
INSERT INTO x SELECT 'cmt', id FROM public.comments WHERE body = '😂😂';
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.comment_likes (comment_id) SELECT v FROM x WHERE k = 'cmt';
SELECT pg_temp.check((SELECT (c->>'likes_count')::int = 1 AND (c->>'liked')::boolean FROM public.get_comments((SELECT v FROM x WHERE k = 'post')) c), 'comment heart counted');
SELECT pg_temp.must_fail($q$INSERT INTO public.comment_likes (comment_id) SELECT v FROM x WHERE k = 'cmt'$q$, 'double heart');
SELECT pg_temp.must_fail($q$UPDATE public.comments SET likes_count = 999$q$, 'fake comment hearts');
DELETE FROM public.comment_likes;
SELECT pg_temp.check((SELECT likes_count FROM public.comments WHERE id = (SELECT v FROM x WHERE k = 'cmt')) = 0, 'unheart');

-- A reposts C's post → share counted once; repost shows original
INSERT INTO public.posts (body, shared_post_id) SELECT 'وګورئ', v FROM x WHERE k = 'post';
INSERT INTO public.posts (shared_post_id) SELECT v FROM x WHERE k = 'post';
SELECT pg_temp.check((SELECT shares_count FROM public.posts WHERE id = (SELECT v FROM x WHERE k = 'post')) = 1, 'repost counted once');
SELECT pg_temp.check((SELECT f->'shared'->>'body' = 'د شریکولو پوسټ' FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001') f WHERE f->>'body' = 'وګورئ'), 'repost shows original');

-- A sends C's post in the DM
INSERT INTO x SELECT 'dm', public.start_direct_chat('cccccccc-0000-0000-0000-000000000003');
INSERT INTO public.messages (conversation_id, post_id) SELECT (SELECT v FROM x WHERE k = 'dm'), (SELECT v FROM x WHERE k = 'post');
SELECT pg_temp.check((SELECT m->'post'->>'body' = 'د شریکولو پوسټ' FROM public.get_messages((SELECT v FROM x WHERE k = 'dm')) m LIMIT 1), 'post preview in chat');
SELECT pg_temp.check((SELECT last_message_preview = '🔗' FROM public.conversations WHERE id = (SELECT v FROM x WHERE k = 'dm')), 'chat list preview for shared post');

-- mute: muted chats do not count as unread
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(public.unread_chats() = 1, 'unread before mute');
SELECT public.set_chat_muted((SELECT v FROM x WHERE k = 'dm'), true);
SELECT pg_temp.check(public.unread_chats() = 0, 'muted chat not counted');
SELECT pg_temp.check((SELECT (c->>'muted')::boolean FROM public.get_conversations() c WHERE c->>'id' = (SELECT v FROM x WHERE k = 'dm')::text), 'list shows muted');
SELECT pg_temp.must_fail($q$UPDATE public.conversation_members SET cleared_at = NULL$q$, 'edit cleared_at directly');

-- read receipts: A sees when C read
SELECT public.mark_chat_read((SELECT v FROM x WHERE k = 'dm'));
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT (public.get_chat_info((SELECT v FROM x WHERE k = 'dm'))->'members'->0->>'last_read_at')::timestamptz > now() - interval '1 minute'), 'read time visible to other member');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(public.get_chat_info((SELECT v FROM x WHERE k = 'dm')) IS NULL, 'outsider gets no chat info');

-- delete chat for me (C): C sees nothing, A still sees everything
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.delete_chat_for_me((SELECT v FROM x WHERE k = 'dm'));
SELECT pg_temp.check((SELECT count(*) FROM public.get_messages((SELECT v FROM x WHERE k = 'dm'))) = 0, 'C history cleared');
SELECT pg_temp.check((SELECT count(*) FROM public.get_conversations() c WHERE c->>'id' = (SELECT v FROM x WHERE k = 'dm')::text) = 0, 'cleared chat hidden from list');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.get_messages((SELECT v FROM x WHERE k = 'dm'))) > 0, 'A keeps history');
INSERT INTO public.messages (conversation_id, body) SELECT v, 'نوی پیغام' FROM x WHERE k = 'dm';
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT count(*) FROM public.get_messages((SELECT v FROM x WHERE k = 'dm'))) = 1, 'C sees only new message');

-- block: C blocks A → no messages, no follow, no comments, hidden in feed/search
SELECT public.block_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT pg_temp.check((public.get_profile('aaaaaaaa-0000-0000-0000-000000000001')->>'blocked_by_me')::boolean, 'profile shows blocked');
SELECT pg_temp.check((SELECT count(*) FROM public.blocks) = 1, 'C sees own block');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.blocks) = 0, 'A cannot see who blocked them');
SELECT pg_temp.must_fail($q$INSERT INTO public.messages (conversation_id, body) SELECT v, 'hi' FROM x WHERE k = 'dm'$q$, 'message someone who blocked you');
SELECT pg_temp.must_fail($q$SELECT public.send_view_once((SELECT v FROM x WHERE k = 'dm'), 'hi', NULL, NULL)$q$, 'view-once to blocker');
SELECT pg_temp.must_fail($q$SELECT public.start_direct_chat('cccccccc-0000-0000-0000-000000000003')$q$, 'start chat with blocker');
SELECT pg_temp.must_fail($q$INSERT INTO public.follows (followee_id) VALUES ('cccccccc-0000-0000-0000-000000000003')$q$, 'follow blocker');
SELECT pg_temp.must_fail($q$INSERT INTO public.comments (post_id, body) SELECT v, 'x' FROM x WHERE k = 'post'$q$, 'comment on blocker post');
SELECT pg_temp.check((SELECT count(*) FROM public.get_feed('foryou') f WHERE f->'author'->>'id' = 'cccccccc-0000-0000-0000-000000000003') = 0, 'blocker hidden in feed');
SELECT pg_temp.check((SELECT count(*) FROM public.search_profiles('karim')) = 0, 'blocker hidden in search');
SELECT pg_temp.must_fail($q$INSERT INTO public.blocks (blocked_id) VALUES ('dddddddd-0000-0000-0000-000000000004')$q$, 'insert block directly');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.unblock_user('aaaaaaaa-0000-0000-0000-000000000001');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.messages (conversation_id, body) SELECT v, 'بیا سلام' FROM x WHERE k = 'dm';
SELECT pg_temp.check(true, 'unblock allows messages again');
RESET ROLE;

SELECT 'ALL EXTRAS TESTS PASSED' AS result;
