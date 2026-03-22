-- Create trash_items table
CREATE TABLE IF NOT EXISTS public.trash_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content JSONB NOT NULL,
    deleted_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    original_path TEXT,
    parent_id TEXT,
    work_name TEXT,
    extra JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.trash_items ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own trash items"
    ON public.trash_items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trash items"
    ON public.trash_items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trash items"
    ON public.trash_items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trash items"
    ON public.trash_items FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster querying
CREATE INDEX idx_trash_items_user_id ON public.trash_items(user_id);
CREATE INDEX idx_trash_items_expires_at ON public.trash_items(expires_at);

-- Create a function to automatically delete expired items
CREATE OR REPLACE FUNCTION delete_expired_trash_items()
RETURNS void AS $$
BEGIN
    DELETE FROM public.trash_items
    WHERE expires_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Create a cron job to run the cleanup function daily (requires pg_cron extension)
-- Note: In a real Supabase project, you would need to enable the pg_cron extension
-- and schedule this job. Since we might not have permissions here, we'll just define it.
-- SELECT cron.schedule('delete-expired-trash', '0 0 * * *', 'SELECT delete_expired_trash_items()');
