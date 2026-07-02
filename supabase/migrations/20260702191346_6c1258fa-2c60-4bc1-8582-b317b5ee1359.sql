-- Plin IA: tabelas de histórico de conversa e controle de uso diário

-- 1) Histórico de conversas
CREATE TABLE public.ia_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  tokens_used integer,
  context_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ia_conversations_user_session
  ON public.ia_conversations(user_id, session_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.ia_conversations TO authenticated;
GRANT ALL ON public.ia_conversations TO service_role;

ALTER TABLE public.ia_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ia_conversations select own"
  ON public.ia_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ia_conversations insert own"
  ON public.ia_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ia_conversations delete own"
  ON public.ia_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2) Controle diário de uso da IA
CREATE TABLE public.ia_usage_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  messages_count integer NOT NULL DEFAULT 0,
  tokens_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_ia_usage_control_user_date
  ON public.ia_usage_control(user_id, date DESC);

GRANT SELECT ON public.ia_usage_control TO authenticated;
GRANT ALL ON public.ia_usage_control TO service_role;

ALTER TABLE public.ia_usage_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ia_usage_control select own"
  ON public.ia_usage_control FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3) Helper para o frontend consultar uso do dia
CREATE OR REPLACE FUNCTION public.get_ia_usage_today(_user_id uuid DEFAULT auth.uid())
RETURNS TABLE(messages_count integer, tokens_used integer, quota_per_day integer, ai_enabled boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _features jsonb;
  _quota integer;
  _enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN _user_id := auth.uid(); END IF;
  IF _user_id <> auth.uid() AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  _features := public.get_user_plan_features(_user_id);
  _enabled := COALESCE((_features->>'ai_enabled')::boolean, false)
              OR public.is_super_admin(_user_id);
  _quota := COALESCE((_features->>'ai_messages_per_day')::integer, 30);
  IF public.is_super_admin(_user_id) THEN _quota := 999999; END IF;

  RETURN QUERY
  SELECT
    COALESCE(u.messages_count, 0),
    COALESCE(u.tokens_used, 0),
    _quota,
    _enabled
  FROM (SELECT 1) x
  LEFT JOIN public.ia_usage_control u
    ON u.user_id = _user_id AND u.date = CURRENT_DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ia_usage_today(uuid) TO authenticated;

-- 4) Habilitar Plin IA por padrão em planos pagos (não-free)
UPDATE public.plans
SET features = COALESCE(features, '{}'::jsonb)
             || jsonb_build_object('ai_enabled', true, 'ai_messages_per_day', 100)
WHERE slug <> 'free' AND is_active = true;

-- Plano free sem IA
UPDATE public.plans
SET features = COALESCE(features, '{}'::jsonb)
             || jsonb_build_object('ai_enabled', false, 'ai_messages_per_day', 0)
WHERE slug = 'free';