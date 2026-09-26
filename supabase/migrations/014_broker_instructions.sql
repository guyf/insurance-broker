-- 014_broker_instructions.sql
-- Standing instructions for the broker ("always conclude with a list of
-- actions"), managed by the Denney team at /admin/instructions and appended
-- to the chat system prompt on every turn. Global, not per-business.
--
-- chat_messages.instructions snapshots the instruction texts that were in
-- force when a model turn ran, so a persisted reply can always be tied back
-- to the exact prompt that produced it even after instructions are edited.

CREATE TABLE IF NOT EXISTS public.broker_instructions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text        text NOT NULL CHECK (length(trim(text)) > 0),
  enabled     boolean NOT NULL DEFAULT true,
  sort        int NOT NULL DEFAULT 0,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broker_instructions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.broker_instructions;
CREATE POLICY "service_role_all" ON public.broker_instructions
  USING (auth.role() = 'service_role');

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS instructions text[];
