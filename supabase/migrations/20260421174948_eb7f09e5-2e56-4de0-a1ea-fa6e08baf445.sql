
-- 1. user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY,
  theme text NOT NULL DEFAULT 'system',
  default_mode text NOT NULL DEFAULT 'research',
  web_search_default boolean NOT NULL DEFAULT true,
  daily_briefing boolean NOT NULL DEFAULT false,
  briefing_topic text,
  reduce_motion boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_select_own" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "settings_insert_own" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "settings_update_own" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER settings_updated BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. Conversation flags
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- 3. share_tokens
CREATE TABLE IF NOT EXISTS public.share_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_owner_all" ON public.share_tokens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- Public read by token
CREATE POLICY "share_public_read" ON public.share_tokens FOR SELECT USING (true);

-- Public read-only access to shared messages: function that returns messages by token
CREATE OR REPLACE FUNCTION public.get_shared_chat(_token text)
RETURNS TABLE (role text, content text, created_at timestamptz, title text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role, m.content, m.created_at, c.title
  FROM public.share_tokens s
  JOIN public.conversations c ON c.id = s.conversation_id
  JOIN public.messages m ON m.conversation_id = s.conversation_id
  WHERE s.token = _token
  ORDER BY m.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.get_shared_chat(text) TO anon, authenticated;
