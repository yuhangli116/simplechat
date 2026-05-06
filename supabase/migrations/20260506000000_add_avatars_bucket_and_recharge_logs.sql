-- Create avatars bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for avatars
-- Allow public read
CREATE POLICY "Avatar images are publicly accessible." ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload their own avatars." ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.uid() = owner
  );

-- Allow authenticated users to update their own avatars
CREATE POLICY "Users can update their own avatars." ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND auth.uid() = owner
  );

-- Create recharge_logs table
CREATE TABLE IF NOT EXISTS public.recharge_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    amount_cny DECIMAL(10, 2) NOT NULL,
    diamonds_obtained INTEGER NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'alipay',
    status VARCHAR(20) DEFAULT 'success',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- RLS for recharge_logs
ALTER TABLE public.recharge_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own recharge logs"
    ON public.recharge_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recharge logs"
    ON public.recharge_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);
