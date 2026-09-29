-- 015_pinned_insights.sql
-- Answers a user has pinned from the broker chat so they can find them again
-- without scrolling history. `content` is a snapshot of the reply (markdown),
-- so a pin survives even if the chat session is later removed; `message_id`
-- is kept (nullable) for the "already pinned" state in the chat UI.
--
-- Same authorization model as 011/013: RLS on, service-role only; the Worker
-- derives business_id from the session.

CREATE TABLE IF NOT EXISTS public.pinned_insights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  message_id   uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  title        text NOT NULL,
  content      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinned_insights_business_created_idx
  ON public.pinned_insights (business_id, created_at DESC);

-- A message can be pinned once per business.
CREATE UNIQUE INDEX IF NOT EXISTS pinned_insights_business_message_idx
  ON public.pinned_insights (business_id, message_id);

ALTER TABLE public.pinned_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.pinned_insights;
CREATE POLICY "service_role_all" ON public.pinned_insights
  USING (auth.role() = 'service_role');
