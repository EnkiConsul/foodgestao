-- =====================================================================
-- Fase 3B.1 · M10 — Coexistência segura legado x novo fluxo
-- Legado: dp_convocacoes.ocorrencia_id IS NULL  -> DML direto permitido
-- Novo:   dp_convocacoes.ocorrencia_id IS NOT NULL -> somente RPC
-- =====================================================================

-- 1) RLS separada por comando -----------------------------------------
DROP POLICY IF EXISTS dp_convocacoes_admin_all ON public.dp_convocacoes;

CREATE POLICY dp_convocacoes_admin_select
ON public.dp_convocacoes
FOR SELECT
TO authenticated
USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_convocacoes_admin_insert_legacy
ON public.dp_convocacoes
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND ocorrencia_id IS NULL
);

CREATE POLICY dp_convocacoes_admin_update_legacy
ON public.dp_convocacoes
FOR UPDATE
TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND ocorrencia_id IS NULL
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND ocorrencia_id IS NULL
);

CREATE POLICY dp_convocacoes_admin_delete_legacy
ON public.dp_convocacoes
FOR DELETE
TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND ocorrencia_id IS NULL
);

-- respond_self: restringe ao legado em USING e WITH CHECK
DROP POLICY IF EXISTS dp_convocacoes_respond_self ON public.dp_convocacoes;

CREATE POLICY dp_convocacoes_respond_self
ON public.dp_convocacoes
FOR UPDATE
TO authenticated
USING (
  public.dp_colaborador_ativo_of((SELECT auth.uid())) IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
  AND ocorrencia_id IS NULL
  AND status = 'pendente'::public.dp_convocacao_status
)
WITH CHECK (
  public.dp_colaborador_ativo_of((SELECT auth.uid())) IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
  AND ocorrencia_id IS NULL
  AND status = ANY (ARRAY['aceita'::public.dp_convocacao_status, 'recusada'::public.dp_convocacao_status])
);

-- 2) Proteção de colunas do colaborador no caminho legado -------------
-- Nome com prefixo 00: o PostgreSQL dispara triggers do mesmo evento em
-- ordem alfabética, então este avalia o NEW original enviado pelo usuário
-- antes de trg_dp_convocacao_guard, trg_dp_convocacao_sync_escala e
-- trg_dp_convocacoes_updated_at derivarem campos internos.
CREATE OR REPLACE FUNCTION public.dp_convocacao_legacy_self_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  -- Somente fluxo legado
  IF OLD.ocorrencia_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RETURN NEW; -- contexto de serviço/migração
  END IF;

  -- Admin/owner mantém o comportamento atual
  IF private.is_company_admin_or_owner(v_uid, OLD.company_id) THEN
    RETURN NEW;
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL OR v_colab <> OLD.colaborador_id THEN
    RETURN NEW; -- não é o caminho respond_self; RLS decide
  END IF;

  v_old := to_jsonb(OLD) - 'status' - 'respondida_em' - 'motivo_recusa' - 'updated_at';
  v_new := to_jsonb(NEW) - 'status' - 'respondida_em' - 'motivo_recusa' - 'updated_at';

  IF v_old <> v_new THEN
    RAISE EXCEPTION 'Na resposta da convocação só é permitido alterar a própria resposta (situação, data da resposta e motivo da recusa).'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_legacy_self_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_legacy_self_columns() FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_legacy_self_columns() FROM authenticated;

DROP TRIGGER IF EXISTS trg_00_dp_convocacao_legacy_self_columns ON public.dp_convocacoes;
CREATE TRIGGER trg_00_dp_convocacao_legacy_self_columns
BEFORE UPDATE ON public.dp_convocacoes
FOR EACH ROW
EXECUTE FUNCTION public.dp_convocacao_legacy_self_columns();