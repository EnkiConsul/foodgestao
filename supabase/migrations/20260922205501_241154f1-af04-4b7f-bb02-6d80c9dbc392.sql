CREATE TABLE public.dp_admissao_rascunhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chave text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_admissao_rascunhos_chave_uq UNIQUE (company_id, user_id, chave)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_admissao_rascunhos TO authenticated;
GRANT ALL ON public.dp_admissao_rascunhos TO service_role;

ALTER TABLE public.dp_admissao_rascunhos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_admissao_rascunhos_owner_select" ON public.dp_admissao_rascunhos
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY "dp_admissao_rascunhos_owner_insert" ON public.dp_admissao_rascunhos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY "dp_admissao_rascunhos_owner_update" ON public.dp_admissao_rascunhos
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_company_member((SELECT auth.uid()), company_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY "dp_admissao_rascunhos_owner_delete" ON public.dp_admissao_rascunhos
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND private.is_company_member((SELECT auth.uid()), company_id));

CREATE TRIGGER trg_dp_admissao_rascunhos_updated_at
  BEFORE UPDATE ON public.dp_admissao_rascunhos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Guardar/atualizar o rascunho. Idempotente por (empresa, usuário, chave).
-- Quando p_versao vem informado e já existe versão mais nova no servidor, nada
-- é sobrescrito: a função devolve a versão atual com conflito = true.
CREATE OR REPLACE FUNCTION public.dp_admissao_rascunho_salvar(
  p_company_id uuid,
  p_chave text,
  p_dados jsonb,
  p_versao integer DEFAULT NULL
)
RETURNS TABLE (versao integer, atualizado_em timestamptz, conflito boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _atual public.dp_admissao_rascunhos;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;
  IF NOT private.is_company_member(_uid, p_company_id) THEN
    RAISE EXCEPTION 'empresa_sem_acesso';
  END IF;
  IF p_chave IS NULL OR btrim(p_chave) = '' THEN
    RAISE EXCEPTION 'chave_invalida';
  END IF;

  SELECT * INTO _atual
  FROM public.dp_admissao_rascunhos r
  WHERE r.company_id = p_company_id AND r.user_id = _uid AND r.chave = p_chave
  FOR UPDATE;

  IF _atual.id IS NULL THEN
    INSERT INTO public.dp_admissao_rascunhos (company_id, user_id, chave, dados, versao)
    VALUES (p_company_id, _uid, p_chave, COALESCE(p_dados, '{}'::jsonb), 1)
    RETURNING dp_admissao_rascunhos.versao, dp_admissao_rascunhos.updated_at
    INTO versao, atualizado_em;
    conflito := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_versao IS NOT NULL AND p_versao < _atual.versao THEN
    versao := _atual.versao;
    atualizado_em := _atual.updated_at;
    conflito := true;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.dp_admissao_rascunhos r
  SET dados = COALESCE(p_dados, '{}'::jsonb), versao = r.versao + 1
  WHERE r.id = _atual.id
  RETURNING r.versao, r.updated_at INTO versao, atualizado_em;
  conflito := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_rascunho_salvar(uuid, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_rascunho_salvar(uuid, text, jsonb, integer) TO authenticated;

-- Descartar o rascunho. Registra no histórico quando havia conteúdo guardado.
CREATE OR REPLACE FUNCTION public.dp_admissao_rascunho_descartar(
  p_company_id uuid,
  p_chave text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;
  IF NOT private.is_company_member(_uid, p_company_id) THEN
    RAISE EXCEPTION 'empresa_sem_acesso';
  END IF;

  DELETE FROM public.dp_admissao_rascunhos r
  WHERE r.company_id = p_company_id AND r.user_id = _uid AND r.chave = p_chave
  RETURNING r.id INTO _id;

  IF _id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details, company_id, actor_kind)
  VALUES (
    _uid,
    (SELECT full_name FROM public.profiles WHERE user_id = _uid LIMIT 1),
    'dp_admissao_rascunhos_deleted',
    'dp_admissao_rascunhos',
    _id::text,
    jsonb_build_object('chave', p_chave, 'company_id', p_company_id::text),
    p_company_id,
    'user'
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_admissao_rascunho_descartar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_admissao_rascunho_descartar(uuid, text) TO authenticated;