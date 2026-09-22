-- ============================================================
-- Correções Pessoas 360° — Fase 5: Escala do Mês e Operação Segura
-- ============================================================

-- 1) Fila por unidade/competência ------------------------------------------
CREATE OR REPLACE FUNCTION private.dp_escala_fila(
  _company_id uuid, _unidade_id uuid, _competencia text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'dp_escala:' || _company_id::text || '|' || COALESCE(_unidade_id::text, 'sem')
      || '|' || COALESCE(_competencia, ''), 0));
END;
$$;
REVOKE ALL ON FUNCTION private.dp_escala_fila(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- 2) Escala do mês garantida (cabeçalho) -----------------------------------
CREATE OR REPLACE FUNCTION private.dp_escala_garantir(
  _company_id uuid, _unidade_id uuid, _competencia text, _uid uuid
) RETURNS public.dp_escalas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE e public.dp_escalas%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.dp_escalas
   WHERE company_id = _company_id
     AND competencia = _competencia
     AND unidade_id IS NOT DISTINCT FROM _unidade_id
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE;

  IF e.id IS NULL THEN
    INSERT INTO public.dp_escalas (company_id, unidade_id, competencia, status, created_by)
    VALUES (_company_id, _unidade_id, _competencia, 'rascunho', _uid)
    RETURNING * INTO e;
  END IF;
  RETURN e;
END;
$$;
REVOKE ALL ON FUNCTION private.dp_escala_garantir(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- 3) Conferência dos dias enviados ----------------------------------------
CREATE OR REPLACE FUNCTION private.dp_escala_itens_conferir(
  _company_id uuid, _unidade_id uuid, _competencia text, _itens jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inicio date := to_date(_competencia || '-01', 'YYYY-MM-DD');
  v_fim date := (to_date(_competencia || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date;
  v_ruim text;
BEGIN
  -- dias fora da competência
  SELECT string_agg(DISTINCT (i->>'data'), ', ') INTO v_ruim
    FROM jsonb_array_elements(_itens) i
   WHERE (i->>'data')::date < v_inicio OR (i->>'data')::date > v_fim;
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'ESCALA_DATA_FORA_DO_MES: % não pertence ao mês da escala.', v_ruim
      USING ERRCODE = 'check_violation';
  END IF;

  -- dia repetido para a mesma pessoa
  SELECT string_agg(x.data, ', ') INTO v_ruim FROM (
    SELECT (i->>'data') AS data
      FROM jsonb_array_elements(_itens) i
     GROUP BY (i->>'colaborador_id'), (i->>'data')
    HAVING count(*) > 1
  ) x;
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'ESCALA_DIA_REPETIDO: há mais de um registro para a mesma pessoa em % .', v_ruim
      USING ERRCODE = 'check_violation';
  END IF;

  -- colaborador da empresa, ativo e da unidade
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_itens) i
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_colaboradores c
        WHERE c.id = (i->>'colaborador_id')::uuid
          AND c.company_id = _company_id
          AND c.deleted_at IS NULL
          AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
     )
  ) THEN
    RAISE EXCEPTION 'ESCALA_COLABORADOR_INVALIDO: há dia lançado para pessoa de outra empresa ou de outra unidade.'
      USING ERRCODE = '42501';
  END IF;

  -- turno da empresa e da unidade
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_itens) i
     WHERE (i->>'turno_id') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_turnos t
          WHERE t.id = (i->>'turno_id')::uuid
            AND t.company_id = _company_id
            AND (t.unidade_id IS NULL OR _unidade_id IS NULL OR t.unidade_id = _unidade_id)
       )
  ) THEN
    RAISE EXCEPTION 'ESCALA_TURNO_INVALIDO: há dia com turno de outra empresa ou de outra unidade.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- setor da empresa
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_itens) i
     WHERE (i->>'setor_id') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_setores s
          WHERE s.id = (i->>'setor_id')::uuid AND s.company_id = _company_id
       )
  ) THEN
    RAISE EXCEPTION 'ESCALA_SETOR_INVALIDO: há dia com setor de outra empresa.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- horas e intervalo coerentes
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_itens) i
     WHERE COALESCE((i->>'intervalo_minutos')::int, 0) < 0
        OR COALESCE((i->>'intervalo_minutos')::int, 0) > 480
        OR COALESCE((i->>'carga_prevista_horas')::numeric, 0) < 0
        OR COALESCE((i->>'carga_prevista_horas')::numeric, 0) > 24
  ) THEN
    RAISE EXCEPTION 'ESCALA_JORNADA_INVALIDA: há dia com intervalo ou carga de horas fora do aceitável.'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.dp_escala_itens_conferir(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 4) Linhas normalizadas a partir do payload ------------------------------
CREATE OR REPLACE FUNCTION private.dp_escala_itens_gravar(
  _company_id uuid, _escala_id uuid, _itens jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_total integer;
BEGIN
  DELETE FROM public.dp_escala_itens WHERE escala_id = _escala_id;

  INSERT INTO public.dp_escala_itens (
    company_id, escala_id, colaborador_id, data, tipo, turno_id, entrada, saida,
    intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, origem,
    observacao, setor_id, setor_motivo)
  SELECT _company_id, _escala_id,
         (i->>'colaborador_id')::uuid,
         (i->>'data')::date,
         COALESCE(NULLIF(i->>'tipo', ''), 'trabalho')::public.dp_escala_item_tipo,
         NULLIF(i->>'turno_id', '')::uuid,
         NULLIF(i->>'entrada', '')::time,
         NULLIF(i->>'saida', '')::time,
         COALESCE((i->>'intervalo_minutos')::int, 0),
         COALESCE((i->>'termina_no_dia_seguinte')::boolean, false),
         COALESCE((i->>'carga_prevista_horas')::numeric, 0),
         COALESCE(NULLIF(i->>'origem', ''), 'gerado')::public.dp_escala_item_origem,
         NULLIF(i->>'observacao', ''),
         NULLIF(i->>'setor_id', '')::uuid,
         NULLIF(i->>'setor_motivo', '')
    FROM jsonb_array_elements(_itens) i;

  SELECT count(*) INTO v_total FROM public.dp_escala_itens WHERE escala_id = _escala_id;
  RETURN COALESCE(v_total, 0);
END;
$$;
REVOKE ALL ON FUNCTION private.dp_escala_itens_gravar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 5) Rotina oficial: gerar o mês -----------------------------------------
CREATE OR REPLACE FUNCTION public.dp_escala_gerar_mes(
  p_competencia text, p_unidade_id uuid, p_itens jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_comp text := NULLIF(btrim(COALESCE(p_competencia, '')), '');
  e public.dp_escalas%ROWTYPE;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF v_comp IS NULL OR v_comp !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o mês da escala.' USING ERRCODE = '22023';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_INPUT: nenhum dia recebido.' USING ERRCODE = '22023';
  END IF;

  IF p_unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = p_unidade_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: unidade não encontrada.' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT (i->>'colaborador_id')::uuid INTO v_company FROM jsonb_array_elements(p_itens) i LIMIT 1;
    SELECT c.company_id INTO v_company FROM public.dp_colaboradores c WHERE c.id = v_company;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a unidade da escala.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a responsáveis da empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM private.dp_escala_fila(v_company, p_unidade_id, v_comp);

  e := private.dp_escala_garantir(v_company, p_unidade_id, v_comp, v_uid);

  IF e.status = 'publicada' THEN
    RAISE EXCEPTION 'ESCALA_PUBLICADA: reabra a escala antes de alterar os dias.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.dp_escala_itens_conferir(v_company, p_unidade_id, v_comp, p_itens);
  v_total := private.dp_escala_itens_gravar(v_company, e.id, p_itens);

  UPDATE public.dp_escalas SET updated_at = now() WHERE id = e.id;

  RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'itens', v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.dp_escala_gerar_mes(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_escala_gerar_mes(text, uuid, jsonb) TO authenticated, service_role;

-- 6) Rotina oficial: ajustar um dia --------------------------------------
CREATE OR REPLACE FUNCTION public.dp_escala_item_ajustar(
  p_competencia text, p_unidade_id uuid, p_item jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_comp text := NULLIF(btrim(COALESCE(p_competencia, '')), '');
  e public.dp_escalas%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF v_comp IS NULL OR v_comp !~ '^\d{4}-\d{2}$' OR p_item IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o mês e o dia a ajustar.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id INTO v_company
    FROM public.dp_colaboradores c
   WHERE c.id = (p_item->>'colaborador_id')::uuid AND c.deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a responsáveis da empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM private.dp_escala_fila(v_company, p_unidade_id, v_comp);
  e := private.dp_escala_garantir(v_company, p_unidade_id, v_comp, v_uid);

  IF e.status = 'publicada' THEN
    RAISE EXCEPTION 'ESCALA_PUBLICADA: reabra a escala antes de alterar os dias.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM private.dp_escala_itens_conferir(
    v_company, p_unidade_id, v_comp, jsonb_build_array(p_item));

  INSERT INTO public.dp_escala_itens (
    company_id, escala_id, colaborador_id, data, tipo, turno_id, entrada, saida,
    intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, origem,
    observacao, setor_id, setor_motivo)
  VALUES (
    v_company, e.id, (p_item->>'colaborador_id')::uuid, (p_item->>'data')::date,
    COALESCE(NULLIF(p_item->>'tipo', ''), 'trabalho')::public.dp_escala_item_tipo,
    NULLIF(p_item->>'turno_id', '')::uuid,
    NULLIF(p_item->>'entrada', '')::time,
    NULLIF(p_item->>'saida', '')::time,
    COALESCE((p_item->>'intervalo_minutos')::int, 0),
    COALESCE((p_item->>'termina_no_dia_seguinte')::boolean, false),
    COALESCE((p_item->>'carga_prevista_horas')::numeric, 0),
    'manual',
    NULLIF(p_item->>'observacao', ''),
    NULLIF(p_item->>'setor_id', '')::uuid,
    NULLIF(p_item->>'setor_motivo', ''))
  ON CONFLICT (escala_id, colaborador_id, data) DO UPDATE
     SET tipo = EXCLUDED.tipo,
         turno_id = EXCLUDED.turno_id,
         entrada = EXCLUDED.entrada,
         saida = EXCLUDED.saida,
         intervalo_minutos = EXCLUDED.intervalo_minutos,
         termina_no_dia_seguinte = EXCLUDED.termina_no_dia_seguinte,
         carga_prevista_horas = EXCLUDED.carga_prevista_horas,
         origem = 'manual',
         observacao = EXCLUDED.observacao,
         setor_id = EXCLUDED.setor_id,
         setor_motivo = EXCLUDED.setor_motivo,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'item_id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dp_escala_item_ajustar(text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_escala_item_ajustar(text, uuid, jsonb) TO authenticated, service_role;

-- 7) Escala publicada protegida ------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_escala_item_publicada_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_escala uuid := COALESCE(NEW.escala_id, OLD.escala_id);
  v_status public.dp_escala_status;
BEGIN
  IF COALESCE(current_setting('dp.escala_oficial', true), '') = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM public.dp_escalas WHERE id = v_escala;
  IF v_status = 'publicada' THEN
    RAISE EXCEPTION 'ESCALA_PUBLICADA: reabra a escala antes de alterar os dias.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_escala_item_publicada ON public.dp_escala_itens;
CREATE TRIGGER trg_dp_escala_item_publicada
  BEFORE INSERT OR UPDATE OR DELETE ON public.dp_escala_itens
  FOR EACH ROW EXECUTE FUNCTION public.dp_escala_item_publicada_guard();

-- rotinas oficiais que legitimamente tocam escala publicada
CREATE OR REPLACE FUNCTION public.dp_convocacao_sync_escala()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp text;
  v_escala_id uuid;
  v_item_id uuid;
BEGIN
  PERFORM set_config('dp.escala_oficial', '1', true);

  IF TG_OP = 'UPDATE' AND NEW.status = 'aceita' AND OLD.status IS DISTINCT FROM 'aceita' THEN
    v_comp := to_char(NEW.data, 'YYYY-MM');

    SELECT id INTO v_escala_id
    FROM public.dp_escalas
    WHERE company_id = NEW.company_id
      AND competencia = v_comp
      AND unidade_id IS NOT DISTINCT FROM NEW.unidade_id
    LIMIT 1;

    IF v_escala_id IS NULL THEN
      INSERT INTO public.dp_escalas (company_id, unidade_id, competencia, status)
      VALUES (NEW.company_id, NEW.unidade_id, v_comp, 'rascunho')
      RETURNING id INTO v_escala_id;
    END IF;

    SELECT id INTO v_item_id
    FROM public.dp_escala_itens
    WHERE escala_id = v_escala_id
      AND colaborador_id = NEW.colaborador_id
      AND data = NEW.data
    LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO public.dp_escala_itens (
        company_id, escala_id, colaborador_id, data, tipo, turno_id,
        entrada, saida, intervalo_minutos, termina_no_dia_seguinte,
        carga_prevista_horas, origem, observacao
      ) VALUES (
        NEW.company_id, v_escala_id, NEW.colaborador_id, NEW.data, 'trabalho', NEW.turno_id,
        NEW.entrada, NEW.saida, NEW.intervalo_minutos, NEW.termina_no_dia_seguinte,
        NEW.carga_prevista_horas, 'convocacao', NEW.observacao
      )
      RETURNING id INTO v_item_id;
    ELSE
      UPDATE public.dp_escala_itens
      SET tipo = 'trabalho',
          turno_id = NEW.turno_id,
          entrada = NEW.entrada,
          saida = NEW.saida,
          intervalo_minutos = NEW.intervalo_minutos,
          termina_no_dia_seguinte = NEW.termina_no_dia_seguinte,
          carga_prevista_horas = NEW.carga_prevista_horas,
          origem = 'convocacao'
      WHERE id = v_item_id;
    END IF;

    NEW.escala_item_id := v_item_id;

  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'aceita'
        AND NEW.status IN ('recusada','cancelada','expirada')
        AND OLD.escala_item_id IS NOT NULL THEN
    DELETE FROM public.dp_escala_itens
    WHERE id = OLD.escala_item_id AND origem = 'convocacao';
    NEW.escala_item_id := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- 8) Fila ao cancelar troca ----------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_cancelar_troca(_troca_id uuid, _motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_cancelada public.dp_folgas_canceladas%ROWTYPE;
  v_folga_solicitante public.dp_folgas%ROWTYPE;
  v_restaurada uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _motivo IS NULL OR length(btrim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'Justificativa obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dp_troca:' || _troca_id::text, 0));

  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada' USING ERRCODE = '22023'; END IF;

  IF NOT (private.is_company_admin_or_owner(_uid, t.company_id)
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF t.status <> 'aprovada' THEN
    RAISE EXCEPTION 'Somente trocas aprovadas podem ser canceladas' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_folga_solicitante
    FROM public.dp_folgas
   WHERE company_id = t.company_id
     AND colaborador_id = t.solicitante_id
     AND data = t.data_original
     AND origem = 'troca'
     AND status <> 'cancelada'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.dp_folgas
       SET status = 'cancelada', updated_at = now()
     WHERE id = v_folga_solicitante.id;

    INSERT INTO public.dp_folgas_canceladas
      (company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    VALUES
      (t.company_id, t.solicitante_id, v_folga_solicitante.id, t.data_original,
       'Troca cancelada pelo gestor (id=' || t.id || '): ' || btrim(_motivo), 'troca', _uid);
  END IF;

  SELECT * INTO v_cancelada
    FROM public.dp_folgas_canceladas
   WHERE company_id = t.company_id
     AND colaborador_id = t.destino_id
     AND data = t.data_original
     AND origem_cancelamento = 'troca'
     AND motivo LIKE 'Troca aprovada (id=' || t.id || ')%'
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND AND v_cancelada.folga_id IS NOT NULL THEN
    UPDATE public.dp_folgas
       SET status = 'agendada', updated_at = now()
     WHERE id = v_cancelada.folga_id
       AND status = 'cancelada'
    RETURNING id INTO v_restaurada;
  END IF;

  UPDATE public.dp_trocas
     SET status = 'cancelada',
         gestor_resposta = 'cancelada: ' || btrim(_motivo),
         gestor_respondido_em = now(),
         gestor_id = _uid,
         updated_at = now()
   WHERE id = t.id;

  RETURN jsonb_build_object(
    'troca_id', t.id,
    'status', 'cancelada',
    'folga_cancelada_id', v_folga_solicitante.id,
    'folga_restaurada_id', v_restaurada
  );
END
$function$;

-- 9) Fechar gravação direta ----------------------------------------------
DROP POLICY IF EXISTS dp_escalas_admin_write ON public.dp_escalas;
CREATE POLICY dp_escalas_admin_read ON public.dp_escalas
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_escala_itens_admin_write ON public.dp_escala_itens;
CREATE POLICY dp_escala_itens_admin_read ON public.dp_escala_itens
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_trocas_write ON public.dp_trocas;
CREATE POLICY dp_trocas_admin_read ON public.dp_trocas
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

DROP POLICY IF EXISTS dp_convocacoes_admin_insert_legacy ON public.dp_convocacoes;
DROP POLICY IF EXISTS dp_convocacoes_admin_update_legacy ON public.dp_convocacoes;
DROP POLICY IF EXISTS dp_convocacoes_admin_delete_legacy ON public.dp_convocacoes;

DROP POLICY IF EXISTS "Admins insert ocorrencia coberturas" ON public.dp_ocorrencia_coberturas;
DROP POLICY IF EXISTS "Admins update ocorrencia coberturas" ON public.dp_ocorrencia_coberturas;
DROP POLICY IF EXISTS "Admins delete ocorrencia coberturas" ON public.dp_ocorrencia_coberturas;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON
  public.dp_escalas, public.dp_escala_itens, public.dp_trocas, public.dp_convocacoes,
  public.dp_convocacao_destinatarios, public.dp_ocorrencias, public.dp_ocorrencia_coberturas
  FROM authenticated;

REVOKE ALL ON
  public.dp_escalas, public.dp_escala_itens, public.dp_trocas, public.dp_convocacoes,
  public.dp_convocacao_destinatarios, public.dp_ocorrencias, public.dp_ocorrencia_coberturas
  FROM anon;

GRANT SELECT ON
  public.dp_escalas, public.dp_escala_itens, public.dp_trocas, public.dp_convocacoes,
  public.dp_convocacao_destinatarios, public.dp_ocorrencias, public.dp_ocorrencia_coberturas
  TO authenticated;

GRANT ALL ON
  public.dp_escalas, public.dp_escala_itens, public.dp_trocas, public.dp_convocacoes,
  public.dp_convocacao_destinatarios, public.dp_ocorrencias, public.dp_ocorrencia_coberturas
  TO service_role;