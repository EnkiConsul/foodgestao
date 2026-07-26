-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.dp_motivo_desligamento AS ENUM (
    'pedido_demissao','dispensa_sem_justa_causa','dispensa_com_justa_causa',
    'termino_contrato','acordo_mutuo','abandono_emprego','aposentadoria','falecimento','outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_elegibilidade_recontratacao AS ENUM ('sim','nao','com_ressalvas');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colunas
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS motivo_desligamento public.dp_motivo_desligamento,
  ADD COLUMN IF NOT EXISTS observacao_desligamento text,
  ADD COLUMN IF NOT EXISTS elegivel_recontratacao public.dp_elegibilidade_recontratacao,
  ADD COLUMN IF NOT EXISTS desligado_por uuid,
  ADD COLUMN IF NOT EXISTS desligado_em timestamptz,
  ADD COLUMN IF NOT EXISTS acesso_portal_ate date;

ALTER TABLE public.dp_pendencias_config
  ADD COLUMN IF NOT EXISTS dias_carencia_portal integer NOT NULL DEFAULT 30;

-- 3. Trigger de coerência do desligamento
CREATE OR REPLACE FUNCTION public.dp_colaborador_desligamento_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dias integer;
BEGIN
  IF NEW.ativo = false AND NEW.data_desligamento IS NULL THEN
    RAISE EXCEPTION 'Informe a data de demissão para desligar o colaborador';
  END IF;

  IF NEW.data_desligamento IS NOT NULL THEN
    NEW.ativo := false;
    SELECT COALESCE(dias_carencia_portal, 30) INTO v_dias
      FROM public.dp_pendencias_config WHERE company_id = NEW.company_id;
    v_dias := COALESCE(v_dias, 30);
    IF NEW.acesso_portal_ate IS NULL
       OR TG_OP = 'UPDATE' AND COALESCE(OLD.data_desligamento, '1900-01-01'::date) IS DISTINCT FROM NEW.data_desligamento THEN
      NEW.acesso_portal_ate := NEW.data_desligamento + v_dias;
    END IF;
    IF NEW.desligado_em IS NULL THEN
      NEW.desligado_em := now();
      NEW.desligado_por := COALESCE(NEW.desligado_por, auth.uid());
    END IF;
  ELSE
    NEW.ativo := COALESCE(NEW.ativo, true);
    NEW.acesso_portal_ate := NULL;
    NEW.motivo_desligamento := NULL;
    NEW.observacao_desligamento := NULL;
    NEW.elegivel_recontratacao := NULL;
    NEW.desligado_em := NULL;
    NEW.desligado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_colaborador_desligamento ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_colaborador_desligamento
BEFORE INSERT OR UPDATE ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_colaborador_desligamento_guard();

-- 4. Acesso ao portal durante carência
CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.dp_colaboradores c
  WHERE (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
    AND c.user_id = _user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.companies co
      WHERE co.id = c.company_id AND co.user_id = _user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = c.company_id
        AND m.user_id = _user_id
        AND m.role IN ('owner','admin')
    )
  ORDER BY c.ativo DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_dp_colaborador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dp_colaboradores c
    WHERE (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
      AND c.user_id = _user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = _user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = _user_id
          AND m.role IN ('owner','admin')
      )
  );
$$;

-- Somente colaborador ATIVO pode escrever
CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.dp_colaboradores c
  WHERE c.ativo = true
    AND c.user_id = _user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.companies co
      WHERE co.id = c.company_id AND co.user_id = _user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = c.company_id
        AND m.user_id = _user_id
        AND m.role IN ('owner','admin')
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.dp_colaborador_ativo_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_ativo_of(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS dp_folgas_self_insert ON public.dp_folgas;
CREATE POLICY dp_folgas_self_insert ON public.dp_folgas
FOR INSERT TO authenticated
WITH CHECK (
  colaborador_id IS NOT NULL
  AND public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  AND company_id = (SELECT c.company_id FROM public.dp_colaboradores c WHERE c.id = public.dp_colaborador_ativo_of(auth.uid()))
  AND criado_por = auth.uid()
  AND origem = 'solicitacao'::dp_folga_origem
  AND extra = false
  AND tipo = 'normal'::dp_folga_tipo
  AND status = 'agendada'::dp_folga_status
);

DROP POLICY IF EXISTS dp_folgas_self_delete ON public.dp_folgas;
CREATE POLICY dp_folgas_self_delete ON public.dp_folgas
FOR DELETE TO authenticated
USING (
  colaborador_id IS NOT NULL
  AND public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  AND criado_por = auth.uid()
  AND origem = 'solicitacao'::dp_folga_origem
  AND status = 'agendada'::dp_folga_status
  AND data >= CURRENT_DATE
);

DROP POLICY IF EXISTS dp_sol_colab_self_write ON public.dp_solicitacoes;
CREATE POLICY dp_sol_colab_self_write ON public.dp_solicitacoes
FOR INSERT TO authenticated
WITH CHECK (
  colaborador_id IS NOT NULL
  AND public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  AND company_id = (SELECT c.company_id FROM public.dp_colaboradores c WHERE c.id = public.dp_colaborador_ativo_of(auth.uid()))
);

DROP POLICY IF EXISTS dp_doc_colab_submit ON public.dp_documentos;
CREATE POLICY dp_doc_colab_submit ON public.dp_documentos
FOR INSERT TO authenticated
WITH CHECK (
  colaborador_id IS NOT NULL
  AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  AND submetido_por_colaborador = true
  AND aprovacao_status = 'pendente'::dp_documento_aprovacao_status
);

-- 5. RPCs de desligamento / reintegração
CREATE OR REPLACE FUNCTION public.dp_desligar_colaborador(
  p_colaborador_id uuid,
  p_data_desligamento date,
  p_motivo public.dp_motivo_desligamento DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_elegibilidade public.dp_elegibilidade_recontratacao DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_folgas int := 0;
  v_sol int := 0;
  v_trocas int := 0;
  v_ate date;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para desligar colaboradores';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = p_data_desligamento,
         motivo_desligamento = p_motivo,
         observacao_desligamento = NULLIF(btrim(coalesce(p_observacao,'')), ''),
         elegivel_recontratacao = p_elegibilidade,
         desligado_por = auth.uid(),
         desligado_em = now(),
         acesso_portal_ate = NULL,
         ativo = false
   WHERE id = p_colaborador_id;

  SELECT acesso_portal_ate INTO v_ate FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  UPDATE public.dp_folgas
     SET status = 'cancelada'::dp_folga_status
   WHERE colaborador_id = p_colaborador_id
     AND status = 'agendada'::dp_folga_status
     AND data > p_data_desligamento;
  GET DIAGNOSTICS v_folgas = ROW_COUNT;

  UPDATE public.dp_solicitacoes
     SET status = 'cancelada'::dp_solicitacao_status
   WHERE colaborador_id = p_colaborador_id
     AND status = 'pendente'::dp_solicitacao_status;
  GET DIAGNOSTICS v_sol = ROW_COUNT;

  UPDATE public.dp_trocas
     SET status = 'cancelada'::dp_troca_status
   WHERE (solicitante_id = p_colaborador_id OR destino_id = p_colaborador_id)
     AND status IN ('pendente_colega'::dp_troca_status, 'pendente_gestor'::dp_troca_status);
  GET DIAGNOSTICS v_trocas = ROW_COUNT;

  RETURN jsonb_build_object(
    'folgas_canceladas', v_folgas,
    'solicitacoes_canceladas', v_sol,
    'trocas_canceladas', v_trocas,
    'acesso_portal_ate', v_ate
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_reintegrar_colaborador(p_colaborador_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para reintegrar colaboradores';
  END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = NULL,
         ativo = true
   WHERE id = p_colaborador_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_desligar_colaborador(uuid, date, public.dp_motivo_desligamento, text, public.dp_elegibilidade_recontratacao) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_desligar_colaborador(uuid, date, public.dp_motivo_desligamento, text, public.dp_elegibilidade_recontratacao) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.dp_reintegrar_colaborador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_reintegrar_colaborador(uuid) TO authenticated, service_role;