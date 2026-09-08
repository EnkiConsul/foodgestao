-- 1) Audiência: gestor não vê mais notificações pessoais de colaboradores
DROP POLICY IF EXISTS "Admins read dp_notificacoes" ON public.dp_notificacoes;
DROP POLICY IF EXISTS "Admins update dp_notificacoes" ON public.dp_notificacoes;

CREATE POLICY "Admins read shared dp_notificacoes"
ON public.dp_notificacoes FOR SELECT TO authenticated
USING (
  user_id IS NULL
  AND para_admins
  AND private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
);

-- 2) Leitura individual por destinatário (notificações compartilhadas entre gestores)
CREATE TABLE public.dp_notificacoes_leituras (
  notificacao_id uuid NOT NULL REFERENCES public.dp_notificacoes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lida_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notificacao_id, user_id)
);
GRANT SELECT, INSERT ON public.dp_notificacoes_leituras TO authenticated;
GRANT ALL ON public.dp_notificacoes_leituras TO service_role;
ALTER TABLE public.dp_notificacoes_leituras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User reads own notif leituras"
ON public.dp_notificacoes_leituras FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "User inserts own notif leituras"
ON public.dp_notificacoes_leituras FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

-- 3) Marcar como lida: afeta somente o usuário atual
CREATE OR REPLACE FUNCTION public.dp_notificacao_marcar_lida(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a int := 0;
  v_b int := 0;
BEGIN
  IF v_uid IS NULL OR _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  -- Notificações pessoais do próprio usuário
  UPDATE public.dp_notificacoes n
     SET lida_em = now()
   WHERE n.id = ANY(_ids)
     AND n.user_id = v_uid
     AND n.lida_em IS NULL;
  GET DIAGNOSTICS v_a = ROW_COUNT;
  -- Notificações compartilhadas com gestores: leitura individual
  INSERT INTO public.dp_notificacoes_leituras (notificacao_id, user_id)
  SELECT n.id, v_uid
    FROM public.dp_notificacoes n
   WHERE n.id = ANY(_ids)
     AND n.user_id IS NULL
     AND n.para_admins
     AND private.is_company_admin_or_owner(v_uid, n.company_id)
  ON CONFLICT (notificacao_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_b = ROW_COUNT;
  RETURN v_a + v_b;
END
$$;

CREATE OR REPLACE FUNCTION public.dp_notificacoes_marcar_todas(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a int := 0;
  v_b int := 0;
BEGIN
  IF v_uid IS NULL OR _company_id IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.dp_notificacoes n
     SET lida_em = now()
   WHERE n.company_id = _company_id
     AND n.user_id = v_uid
     AND n.lida_em IS NULL;
  GET DIAGNOSTICS v_a = ROW_COUNT;
  INSERT INTO public.dp_notificacoes_leituras (notificacao_id, user_id)
  SELECT n.id, v_uid
    FROM public.dp_notificacoes n
   WHERE n.company_id = _company_id
     AND n.user_id IS NULL
     AND n.para_admins
     AND private.is_company_admin_or_owner(v_uid, n.company_id)
  ON CONFLICT (notificacao_id, user_id) DO NOTHING;
  GET DIAGNOSTICS v_b = ROW_COUNT;
  RETURN v_a + v_b;
END
$$;

REVOKE ALL ON FUNCTION public.dp_notificacao_marcar_lida(uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.dp_notificacoes_marcar_todas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dp_notificacao_marcar_lida(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_notificacoes_marcar_todas(uuid) TO authenticated;