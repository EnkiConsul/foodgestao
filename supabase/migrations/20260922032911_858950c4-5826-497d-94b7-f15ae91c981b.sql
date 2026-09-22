-- =====================================================================
-- FASE 2 — Solicitações e Estados Administrativos (Pessoas 360°)
-- Rollback ao final do arquivo (bloco comentado).
-- =====================================================================

-- 1) Exclusão lógica e rastro de correção
ALTER TABLE public.dp_solicitacoes
  ADD COLUMN IF NOT EXISTS removido_em timestamptz,
  ADD COLUMN IF NOT EXISTS removido_por uuid,
  ADD COLUMN IF NOT EXISTS removido_motivo text,
  ADD COLUMN IF NOT EXISTS corrigido_em timestamptz,
  ADD COLUMN IF NOT EXISTS corrigido_por uuid;

CREATE INDEX IF NOT EXISTS idx_dp_solicitacoes_ativas
  ON public.dp_solicitacoes (company_id, tipo, status)
  WHERE removido_em IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_adiantamento_solic_unica
  ON public.dp_adiantamento_solicitacoes (colaborador_id, tipo, data_solicitacao);

-- 2) Coerência empresa x colaborador
CREATE OR REPLACE FUNCTION public.dp_solicitacao_coerencia_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT c.company_id INTO v_company
    FROM public.dp_colaboradores c WHERE c.id = NEW.colaborador_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'COLABORADOR_INVALIDO: colaborador não encontrado.' USING ERRCODE = '23514';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'EMPRESA_DIVERGENTE: o colaborador pertence a outra empresa.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_solicitacao_coerencia ON public.dp_solicitacoes;
CREATE TRIGGER trg_dp_solicitacao_coerencia
  BEFORE INSERT OR UPDATE OF company_id, colaborador_id ON public.dp_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_solicitacao_coerencia_guard();

-- 3) Correção de atestado/licença (rotina única)
CREATE OR REPLACE FUNCTION public.dp_solicitacao_corrigir(
  p_id uuid,
  p_colaborador uuid,
  p_data_alvo date,
  p_data_fim date,
  p_motivo text DEFAULT NULL,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_company uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_colaborador IS NULL OR p_data_alvo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a solicitação, o colaborador e a data.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: solicitação não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_row.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_row.removido_em IS NOT NULL THEN
    RAISE EXCEPTION 'REMOVIDA: esta solicitação foi excluída.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.tipo NOT IN ('atestado'::public.dp_solicitacao_tipo,
                        'licenca_maternidade'::public.dp_solicitacao_tipo,
                        'licenca_paternidade'::public.dp_solicitacao_tipo) THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: apenas atestados e licenças podem ser corrigidos aqui.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  IF v_company IS NULL OR v_company <> v_row.company_id THEN
    RAISE EXCEPTION 'COLABORADOR_INVALIDO: o colaborador não pertence a esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_data_fim, p_data_alvo) < p_data_alvo THEN
    RAISE EXCEPTION 'PERIODO_INVALIDO: a data final não pode ser anterior à inicial.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_solicitacoes
     SET colaborador_id = p_colaborador,
         data_alvo = p_data_alvo,
         data_fim = COALESCE(p_data_fim, p_data_alvo),
         motivo = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
         resposta_admin = COALESCE(
           NULLIF(btrim(COALESCE(p_justificativa, '')), ''),
           resposta_admin
         ),
         corrigido_em = now(),
         corrigido_por = v_uid,
         updated_at = now()
   WHERE id = p_id;

  -- Ocorrências geradas pelo atestado aprovado: cancela dias fora do novo
  -- período e reaplica o período corrigido.
  IF v_row.tipo = 'atestado'::public.dp_solicitacao_tipo
     AND v_row.status = 'aprovada'::public.dp_solicitacao_status THEN
    UPDATE public.dp_ocorrencias o
       SET estado = 'cancelada'::public.dp_ocorrencia_estado,
           updated_at = now()
     WHERE o.solicitacao_id = p_id
       AND o.estado <> 'cancelada'::public.dp_ocorrencia_estado
       AND o.origem = 'sistema'::public.dp_ocorrencia_origem
       AND (o.colaborador_id <> p_colaborador
            OR o.data_operacional < p_data_alvo
            OR o.data_operacional > COALESCE(p_data_fim, p_data_alvo));
    PERFORM public.dp_ocorrencia_atestado_aplicar(p_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id);
END;
$$;

-- 4) Exclusão lógica
CREATE OR REPLACE FUNCTION public.dp_solicitacao_excluir(
  p_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a solicitação.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: solicitação não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_row.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  IF v_row.removido_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id, 'ja_removida', true);
  END IF;

  UPDATE public.dp_solicitacoes
     SET removido_em = now(),
         removido_por = v_uid,
         removido_motivo = NULLIF(btrim(COALESCE(p_motivo, '')), ''),
         updated_at = now()
   WHERE id = p_id;

  UPDATE public.dp_ocorrencias o
     SET estado = 'cancelada'::public.dp_ocorrencia_estado,
         updated_at = now()
   WHERE o.solicitacao_id = p_id
     AND o.estado <> 'cancelada'::public.dp_ocorrencia_estado
     AND o.origem = 'sistema'::public.dp_ocorrencia_origem;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', p_id, 'ja_removida', false);
END;
$$;

-- 5) Retorno / prorrogação de licença
CREATE OR REPLACE FUNCTION public.dp_licenca_retorno_registrar(
  p_id uuid,
  p_acao text,
  p_data date,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_acao IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a licença e a ação.' USING ERRCODE = '22023';
  END IF;
  IF p_acao NOT IN ('confirmar', 'prorrogar') THEN
    RAISE EXCEPTION 'INVALID_INPUT: ação inválida.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));

  SELECT * INTO v_row FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADA: licença não encontrada.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_row.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;
  IF v_row.removido_em IS NOT NULL THEN
    RAISE EXCEPTION 'REMOVIDA: esta licença foi excluída.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.tipo NOT IN ('licenca_maternidade'::public.dp_solicitacao_tipo,
                        'licenca_paternidade'::public.dp_solicitacao_tipo,
                        'atestado'::public.dp_solicitacao_tipo) THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: registro não é uma licença.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  IF p_acao = 'prorrogar' THEN
    IF p_data <= COALESCE(v_row.data_fim, v_row.data_alvo) THEN
      RAISE EXCEPTION 'PERIODO_INVALIDO: a nova data final deve ser posterior à prevista.'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.dp_solicitacoes
       SET data_fim = p_data,
           resposta_admin = COALESCE(NULLIF(btrim(COALESCE(p_observacao, '')), ''), 'Licença prorrogada.'),
           updated_at = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'acao', 'prorrogar', 'data_fim', p_data);
  END IF;

  IF v_row.retorno_confirmado_em IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'acao', 'confirmar', 'ja_confirmado', true);
  END IF;
  IF p_data < v_row.data_alvo THEN
    RAISE EXCEPTION 'PERIODO_INVALIDO: o retorno não pode ser anterior ao início da licença.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_solicitacoes
     SET retorno_em = p_data,
         retorno_confirmado_em = now(),
         retorno_confirmado_por = v_uid,
         data_fim = LEAST(COALESCE(data_fim, p_data), p_data),
         resposta_admin = COALESCE(
           NULLIF(btrim(COALESCE(p_observacao, '')), ''),
           'Retorno confirmado em ' || to_char(p_data, 'DD/MM/YYYY') || '.'
         ),
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'acao', 'confirmar', 'ja_confirmado', false);
END;
$$;

-- 6) Adiantamento salarial: rotina única
CREATE OR REPLACE FUNCTION public.dp_adiantamento_registrar(
  p_colaborador uuid,
  p_tipo text,
  p_data date,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_self uuid;
  v_admin boolean := false;
  v_origem text;
  v_id uuid;
  v_competencia text;
  v_dia int;
  v_pagamento date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_tipo IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colaborador, o tipo e a data.' USING ERRCODE = '22023';
  END IF;
  IF p_tipo NOT IN ('ativar', 'cancelar') THEN
    RAISE EXCEPTION 'INVALID_INPUT: tipo inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;

  v_admin := private.is_company_admin_or_owner(v_uid, v_company);
  v_self := public.dp_colaborador_ativo_of(v_uid);

  IF v_admin THEN
    v_origem := 'gestor';
  ELSIF v_self IS NOT NULL AND v_self = p_colaborador THEN
    v_origem := 'portal';
  ELSE
    RAISE EXCEPTION 'FORBIDDEN: sem permissão para registrar este adiantamento.' USING ERRCODE = '42501';
  END IF;

  IF v_origem = 'portal' AND p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'DATA_INVALIDA: no portal a data não pode ser retroativa.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_colaborador::text || p_tipo || p_data::text, 0));

  SELECT s.id, s.competencia_efeito INTO v_id, v_competencia
    FROM public.dp_adiantamento_solicitacoes s
   WHERE s.colaborador_id = p_colaborador
     AND s.tipo = p_tipo
     AND s.data_solicitacao = p_data
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id,
                              'competencia_efeito', v_competencia,
                              'origem', v_origem, 'duplicada', true);
  END IF;

  -- Competência do gestor: dia do pagamento da unidade, sem carência.
  SELECT u.dia_adiantamento INTO v_dia
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.id = p_colaborador;
  v_pagamento := LEAST(
    date_trunc('month', p_data)::date + (COALESCE(v_dia, 15) - 1),
    (date_trunc('month', p_data) + INTERVAL '1 month - 1 day')::date
  );
  v_competencia := CASE
    WHEN p_data >= v_pagamento THEN to_char(p_data + INTERVAL '1 month', 'YYYY-MM')
    ELSE to_char(p_data, 'YYYY-MM')
  END;

  INSERT INTO public.dp_adiantamento_solicitacoes
    (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, criado_por)
  VALUES
    (v_company, p_colaborador, p_tipo, p_data, v_competencia, v_origem,
     NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id, competencia_efeito INTO v_id, v_competencia;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id,
                            'competencia_efeito', v_competencia,
                            'origem', v_origem, 'duplicada', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_solicitacao_corrigir(uuid, uuid, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_solicitacao_excluir(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_licenca_retorno_registrar(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_adiantamento_registrar(uuid, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_corrigir(uuid, uuid, date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_excluir(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_licenca_retorno_registrar(uuid, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_adiantamento_registrar(uuid, text, date, text) TO authenticated, service_role;

-- 7) Menor privilégio: escrita direta do aplicativo removida
DROP POLICY IF EXISTS dp_sol_admin_update ON public.dp_solicitacoes;
DROP POLICY IF EXISTS dp_sol_admin_delete ON public.dp_solicitacoes;
REVOKE UPDATE, DELETE ON public.dp_solicitacoes FROM authenticated;

DROP POLICY IF EXISTS dp_ads_admin_all ON public.dp_adiantamento_solicitacoes;
DROP POLICY IF EXISTS dp_ads_insert_self ON public.dp_adiantamento_solicitacoes;
CREATE POLICY dp_ads_admin_read ON public.dp_adiantamento_solicitacoes
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
REVOKE INSERT, UPDATE, DELETE ON public.dp_adiantamento_solicitacoes FROM authenticated;

-- =====================================================================
-- ROLLBACK
-- DROP TRIGGER IF EXISTS trg_dp_solicitacao_coerencia ON public.dp_solicitacoes;
-- DROP FUNCTION IF EXISTS public.dp_solicitacao_coerencia_guard();
-- DROP FUNCTION IF EXISTS public.dp_solicitacao_corrigir(uuid, uuid, date, date, text, text);
-- DROP FUNCTION IF EXISTS public.dp_solicitacao_excluir(uuid, text);
-- DROP FUNCTION IF EXISTS public.dp_licenca_retorno_registrar(uuid, text, date, text);
-- DROP FUNCTION IF EXISTS public.dp_adiantamento_registrar(uuid, text, date, text);
-- DROP INDEX IF EXISTS public.idx_dp_solicitacoes_ativas;
-- DROP INDEX IF EXISTS public.uq_dp_adiantamento_solic_unica;
-- GRANT UPDATE, DELETE ON public.dp_solicitacoes TO authenticated;
-- CREATE POLICY dp_sol_admin_update ON public.dp_solicitacoes FOR UPDATE TO authenticated
--   USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
--   WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
-- CREATE POLICY dp_sol_admin_delete ON public.dp_solicitacoes FOR DELETE TO authenticated
--   USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
-- DROP POLICY IF EXISTS dp_ads_admin_read ON public.dp_adiantamento_solicitacoes;
-- GRANT INSERT, UPDATE, DELETE ON public.dp_adiantamento_solicitacoes TO authenticated;
-- CREATE POLICY dp_ads_admin_all ON public.dp_adiantamento_solicitacoes FOR ALL TO authenticated
--   USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
--   WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));
-- ALTER TABLE public.dp_solicitacoes DROP COLUMN removido_em, DROP COLUMN removido_por,
--   DROP COLUMN removido_motivo, DROP COLUMN corrigido_em, DROP COLUMN corrigido_por;
-- =====================================================================
