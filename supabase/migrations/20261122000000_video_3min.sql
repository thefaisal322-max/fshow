-- Videos up to 3 minutes: the posts bucket takes files up to 50 MB (the Supabase free-plan maximum).
-- The "Videos to Cloudflare" workflow shrinks them to < 24 MB before moving them.
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'posts';
