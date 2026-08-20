ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS dp_colaboradores_deleted_idx
  ON public.dp_colaboradores (company_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

DROP POLICY IF EXISTS dp_colab_admin_read ON public.dp_colaboradores;
CREATE POLICY dp_colab_admin_read ON public.dp_colaboradores
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = (SELECT auth.uid()))
    OR public.is_super_admin((SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS dp_colab_admin_write ON public.dp_colaboradores;
CREATE POLICY dp_colab_admin_write ON public.dp_colaboradores
FOR ALL
USING (
  deleted_at IS NULL
  AND (
    private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = (SELECT auth.uid()))
    OR public.is_super_admin((SELECT auth.uid()))
  )
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS dp_colab_self_read ON public.dp_colaboradores;
CREATE POLICY dp_colab_self_read ON public.dp_colaboradores
FOR SELECT
USING (deleted_at IS NULL AND user_id = (SELECT auth.uid()));

-- Autorização comum às ações da lixeira
CREATE OR REPLACE FUNCTION public.dp_pode_gerenciar_lixeira(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_company_admin_or_owner(auth.uid(), _company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = _company_id AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid());
$$;

-- Exclusão com justificativa (soft delete)
CREATE OR REPLACE FUNCTION public.dp_excluir_colaborador(p_colaborador_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_nome text;
BEGIN
  IF coalesce(length(btrim(p_motivo)), 0) < 5 THEN
    RAISE EXCEPTION 'Informe a justificativa da exclusão (mínimo 5 caracteres)';
  END IF;

  SELECT company_id, nome INTO v_company, v_nome
  FROM public.dp_colaboradores WHERE id = p_colaborador_id AND deleted_at IS NULL;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  IF NOT public.dp_pode_gerenciar_lixeira(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para excluir colaboradores';
  END IF;

  UPDATE public.dp_colaboradores
     SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = btrim(p_motivo)
   WHERE id = p_colaborador_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'dp_colaborador_excluido', 'dp_colaborador', p_colaborador_id,
          jsonb_build_object('company_id', v_company, 'nome', v_nome, 'motivo', btrim(p_motivo)));
END;
$$;

-- Restauração
CREATE OR REPLACE FUNCTION public.dp_restaurar_colaborador(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_nome text;
BEGIN
  SELECT company_id, nome INTO v_company, v_nome
  FROM public.dp_colaboradores WHERE id = p_colaborador_id AND deleted_at IS NOT NULL;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Colaborador não está na lixeira';
  END IF;

  IF NOT public.dp_pode_gerenciar_lixeira(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar colaboradores';
  END IF;

  UPDATE public.dp_colaboradores
     SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
   WHERE id = p_colaborador_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'dp_colaborador_restaurado', 'dp_colaborador', p_colaborador_id,
          jsonb_build_object('company_id', v_company, 'nome', v_nome));
END;
$$;

-- Exclusão definitiva
CREATE OR REPLACE FUNCTION public.dp_purgar_colaborador(p_colaborador_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_nome text;
BEGIN
  SELECT company_id, nome INTO v_company, v_nome
  FROM public.dp_colaboradores WHERE id = p_colaborador_id AND deleted_at IS NOT NULL;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Colaborador não está na lixeira';
  END IF;

  IF NOT public.dp_pode_gerenciar_lixeira(v_company) THEN
    RAISE EXCEPTION 'Sem permissão para excluir definitivamente';
  END IF;

  DELETE FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (auth.uid(), NULL, 'dp_colaborador_purgado', 'dp_colaborador', p_colaborador_id,
          jsonb_build_object('company_id', v_company, 'nome', v_nome, 'motivo', nullif(btrim(coalesce(p_motivo, '')), '')));
END;
$$;

-- Listagem da lixeira (purga automática dos vencidos, retenção de 7 dias)
CREATE OR REPLACE FUNCTION public.dp_colaboradores_lixeira(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  cargo_nome text,
  unidade_nome text,
  matricula text,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  expira_em timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.dp_pode_gerenciar_lixeira(p_company_id) THEN
    RAISE EXCEPTION 'Sem permissão para acessar a lixeira';
  END IF;

  DELETE FROM public.dp_colaboradores c
   WHERE c.company_id = p_company_id
     AND c.deleted_at IS NOT NULL
     AND c.deleted_at < now() - interval '7 days';

  RETURN QUERY
  SELECT c.id, c.nome, cg.nome, u.nome, c.matricula, c.deleted_at, c.deleted_by, c.delete_reason,
         c.deleted_at + interval '7 days'
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_cargos cg ON cg.id = c.cargo_id
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.company_id = p_company_id
     AND c.deleted_at IS NOT NULL
   ORDER BY c.deleted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_excluir_colaborador(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.dp_restaurar_colaborador(uuid) FROM public;
REVOKE ALL ON FUNCTION public.dp_purgar_colaborador(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.dp_colaboradores_lixeira(uuid) FROM public;
REVOKE ALL ON FUNCTION public.dp_pode_gerenciar_lixeira(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.dp_excluir_colaborador(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_restaurar_colaborador(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_purgar_colaborador(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_colaboradores_lixeira(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_pode_gerenciar_lixeira(uuid) TO authenticated;