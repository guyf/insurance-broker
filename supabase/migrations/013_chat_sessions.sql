-- 013_chat_sessions.sql
-- Persist broker chat sessions. Previously chat was entirely stateless: the
-- browser held the history in React state and POSTed the whole array on
-- every turn, so a refresh lost the conversation and nothing was ever
-- recorded for review. The Worker is now authoritative for history: it
-- loads prior turns from here, runs the agentic loop, and writes back every
-- turn — including intermediate tool_use / tool_result turns, so the
-- broker's reasoning can be reviewed and used to improve the prompt.
--
-- Same authorization model as 011: RLS on, service-role only; the Worker
-- derives business_id from the session and checks session ownership itself.

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_sessions_business_updated_idx
  ON public.chat_sessions (business_id, updated_at DESC);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.chat_sessions;
CREATE POLICY "service_role_all" ON public.chat_sessions
  USING (auth.role() = 'service_role');

-- One row per Anthropic message turn. `content` is the raw content-block
-- array exactly as sent to / returned by the Messages API, so a session can
-- be replayed verbatim. `kind` separates what the user saw from plumbing:
--   user        — a message the user typed
--   assistant   — the broker's final reply for a turn (shown in the UI)
--   tool_call   — an intermediate assistant turn containing tool_use blocks
--   tool_result — the tool_result blocks fed back to the model
--   note        — assistant text shown in the UI but not produced by the
--                 chat loop (e.g. the Analyse Policies summary)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  seq             int NOT NULL,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  kind            text NOT NULL CHECK (kind IN ('user', 'assistant', 'tool_call', 'tool_result', 'note')),
  content         jsonb NOT NULL,
  model           text,
  prompt_version  text,
  input_tokens    int,
  output_tokens   int,
  latency_ms      int,
  quote           jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.chat_messages;
CREATE POLICY "service_role_all" ON public.chat_messages
  USING (auth.role() = 'service_role');

-- Thumbs up/down on an assistant reply — the signal used to find
-- conversations worth reviewing. One rating per message; re-rating replaces.
CREATE TABLE IF NOT EXISTS public.chat_feedback (
  message_id  uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating IN (-1, 1)),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.chat_feedback;
CREATE POLICY "service_role_all" ON public.chat_feedback
  USING (auth.role() = 'service_role');
