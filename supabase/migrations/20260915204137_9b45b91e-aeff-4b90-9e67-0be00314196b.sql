-- =========================================================
-- Concessão de acesso administrativo a partir do perfil de
-- acesso do colaborador (automático COM confirmação humana).
-- Idempotente. Rollback: ver docs no final.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.dp_acesso_concessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  acao text NOT NULL CHECK (acao IN ('conceder','revogar')),
  papel public.company_role NULL,
  permissoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  perfil_acesso public.dp_perfil_acesso NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concedido','recusado','cancelado')),
  origem text NOT NULL DEFAULT 'cadastro_colaborador',
  decidido_por uuid NULL,
  decidido_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_acesso_concessoes_pendente_uniq
  ON public.dp_acesso_concessoes (colaborador_id)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS dp_acesso_concessoes_company_status_idx
  ON public.dp_acesso_concessoes (company_id, status);

GRANT SELECT ON public.dp_acesso_concessoes TO authenticated;
GRANT ALL ON public.dp_acesso_concessoes TO service_role;

ALTER TABLE public.dp_acesso_concessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_acesso_concessoes_select ON public.dp_acesso_concessoes;
CREATE POLICY dp_acesso_concessoes_select
  ON public.dp_acesso_concessoes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_acesso_concessoes.company_id AND c.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_dp_acesso_concessoes_updated_at ON public.dp_acesso_concessoes;
CREATE TRIGGER trg_dp_acesso_concessoes_updated_at
  BEFORE UPDATE ON public.dp_acesso_concessoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------
-- Papel/permissões propostos por perfil de acesso.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_perfil_papel_proposto(_perfil public.dp_perfil_acesso)
RETURNS TABLE(papel public.company_role, permissoes jsonb)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _perfil
           WHEN 'admin' THEN 'admin'::public.company_role
           WHEN 'gestor' THEN 'member'::public.company_role
           ELSE NULL::public.company_role
         END,
         CASE _perfil
           WHEN 'gestor' THEN '{"dp":"edit"}'::jsonb
           ELSE '{}'::jsonb
         END;
$$;

REVOKE ALL ON FUNCTION public.dp_perfil_papel_proposto(public.dp_perfil_acesso) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_perfil_papel_proposto(public.dp_perfil_acesso) TO service_role;

-- ---------------------------------------------------------
-- Trigger: propõe (nunca aplica) mudança de acesso.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_acesso_concessao_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_papel public.company_role;
  v_perms jsonb;
  v_membro_papel public.company_role;
  v_membro_perms jsonb;
  v_is_owner boolean;
BEGIN
  -- Sem login vinculado, colaborador excluído ou sem empresa: nada a propor.
  IF NEW.user_id IS NULL OR NEW.deleted_at IS NOT NULL OR NEW.company_id IS NULL THEN
    UPDATE public.dp_acesso_concessoes
       SET status = 'cancelado'
     WHERE colaborador_id = NEW.id AND status = 'pendente';
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = NEW.company_id AND c.user_id = NEW.user_id)
    INTO v_is_owner;

  SELECT m.role, m.permissions INTO v_membro_papel, v_membro_perms
    FROM public.company_members m
   WHERE m.company_id = NEW.company_id AND m.user_id = NEW.user_id;

  SELECT p.papel, p.permissoes INTO v_papel, v_perms
    FROM public.dp_perfil_papel_proposto(NEW.perfil_acesso) p;

  -- Titular da conta já tem acesso total: nunca propor nada.
  IF v_is_owner OR v_membro_papel = 'owner' THEN
    UPDATE public.dp_acesso_concessoes
       SET status = 'cancelado'
     WHERE colaborador_id = NEW.id AND status = 'pendente';
    RETURN NEW;
  END IF;

  IF v_papel IS NOT NULL THEN
    -- Já tem exatamente o acesso proposto? nada pendente.
    IF v_membro_papel IS NOT NULL
       AND v_membro_papel = v_papel
       AND COALESCE(v_membro_perms, '{}'::jsonb) @> v_perms THEN
      UPDATE public.dp_acesso_concessoes
         SET status = 'cancelado'
       WHERE colaborador_id = NEW.id AND status = 'pendente';
      RETURN NEW;
    END IF;

    UPDATE public.dp_acesso_concessoes
       SET status = 'cancelado'
     WHERE colaborador_id = NEW.id
       AND status = 'pendente'
       AND (acao <> 'conceder' OR papel IS DISTINCT FROM v_papel OR permissoes IS DISTINCT FROM v_perms);

    INSERT INTO public.dp_acesso_concessoes
      (company_id, colaborador_id, user_id, acao, papel, permissoes, perfil_acesso)
    SELECT NEW.company_id, NEW.id, NEW.user_id, 'conceder', v_papel, v_perms, NEW.perfil_acesso
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_acesso_concessoes
        WHERE colaborador_id = NEW.id AND status = 'pendente'
     );
    RETURN NEW;
  END IF;

  -- Perfil voltou a "colaborador": propõe retirar o acesso administrativo.
  IF v_membro_papel IS NOT NULL THEN
    UPDATE public.dp_acesso_concessoes
       SET status = 'cancelado'
     WHERE colaborador_id = NEW.id AND status = 'pendente' AND acao <> 'revogar';

    INSERT INTO public.dp_acesso_concessoes
      (company_id, colaborador_id, user_id, acao, papel, permissoes, perfil_acesso)
    SELECT NEW.company_id, NEW.id, NEW.user_id, 'revogar', v_membro_papel,
           COALESCE(v_membro_perms, '{}'::jsonb), NEW.perfil_acesso
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_acesso_concessoes
        WHERE colaborador_id = NEW.id AND status = 'pendente'
     );
  ELSE
    UPDATE public.dp_acesso_concessoes
       SET status = 'cancelado'
     WHERE colaborador_id = NEW.id AND status = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_acesso_concessao_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_acesso_concessao_sync() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_acesso_concessao_sync ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_acesso_concessao_sync
  AFTER INSERT OR UPDATE OF perfil_acesso, user_id, deleted_at ON public.dp_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.dp_acesso_concessao_sync();

-- ---------------------------------------------------------
-- Decisão humana: concede ou retira o acesso, atomicamente.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_acesso_concessao_decidir(_id uuid, _decisao text)
RETURNS public.dp_acesso_concessoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.dp_acesso_concessoes;
  v_uid uuid := auth.uid();
  v_super boolean;
  v_autorizado boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autorizado.' USING ERRCODE = '42501';
  END IF;
  IF _decisao NOT IN ('conceder','recusar') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.dp_acesso_concessoes WHERE id = _id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'pendente' THEN
    RAISE EXCEPTION 'Solicitação já decidida.' USING ERRCODE = '22023';
  END IF;

  v_super := public.has_role(v_uid, 'super_admin');
  v_autorizado := v_super
    OR public.is_company_admin_or_owner(v_uid, v_row.company_id)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_row.company_id AND c.user_id = v_uid);

  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'Não autorizado.' USING ERRCODE = '42501';
  END IF;
  -- Ninguém confirma o próprio acesso.
  IF v_row.user_id = v_uid AND NOT v_super THEN
    RAISE EXCEPTION 'A confirmação deve ser feita por outro administrador.' USING ERRCODE = '42501';
  END IF;

  IF _decisao = 'recusar' THEN
    UPDATE public.dp_acesso_concessoes
       SET status = 'recusado', decidido_por = v_uid, decidido_em = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  IF v_row.acao = 'conceder' THEN
    INSERT INTO public.company_members (company_id, user_id, role, permissions)
    VALUES (v_row.company_id, v_row.user_id, v_row.papel, v_row.permissoes)
    ON CONFLICT (company_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          permissions = EXCLUDED.permissions,
          updated_at = now();
  ELSE
    DELETE FROM public.company_members
     WHERE company_id = v_row.company_id
       AND user_id = v_row.user_id
       AND role <> 'owner';
  END IF;

  UPDATE public.dp_acesso_concessoes
     SET status = 'concedido', decidido_por = v_uid, decidido_em = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_acesso_concessao_decidir(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_acesso_concessao_decidir(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_acesso_concessao_decidir(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_acesso_concessao_decidir(uuid, text) TO service_role;

COMMENT ON TABLE public.dp_acesso_concessoes IS
  'Propostas de acesso administrativo derivadas do perfil de acesso do colaborador. Aplicadas somente por dp_acesso_concessao_decidir. Rollback: DROP TRIGGER trg_dp_acesso_concessao_sync ON public.dp_colaboradores; DROP FUNCTION public.dp_acesso_concessao_decidir(uuid,text); DROP FUNCTION public.dp_acesso_concessao_sync(); DROP FUNCTION public.dp_perfil_papel_proposto(public.dp_perfil_acesso); DROP TABLE public.dp_acesso_concessoes;';