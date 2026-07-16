
-- =========================================================================
-- FASE 2 / ONDA 2 — RPCs + trigger de validação
-- =========================================================================

-- Helper: data da Páscoa (Meeus/Butcher) para regras dinâmicas
CREATE OR REPLACE FUNCTION public.dp_pascoa(_ano int)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a int; b int; c int; d int; e int; f int; g int; h int; i int; k int;
  l int; m int; mes int; dia int;
BEGIN
  a := _ano % 19;
  b := _ano / 100;
  c := _ano % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes := (h + l - 7 * m + 114) / 31;
  dia := ((h + l - 7 * m + 114) % 31) + 1;
  RETURN make_date(_ano, mes, dia);
END $$;

-- =========================================================================
-- 1) dp_calc_data_regra(regra_id, ano) -> date
-- Regra fixa: make_date(ano, mes, dia)
-- Regra dinamica: regra_json = {"tipo": "pascoa_offset", "offset": <int>}
--   ex: Sexta-Feira Santa (-2), Carnaval Terça (-47), Corpus Christi (+60)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dp_calc_data_regra(_regra_id uuid, _ano int)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.dp_bloqueio_regras%ROWTYPE;
  v_tipo text;
  v_offset int;
BEGIN
  SELECT * INTO r FROM public.dp_bloqueio_regras WHERE id = _regra_id;
  IF NOT FOUND OR NOT r.ativo THEN RETURN NULL; END IF;

  IF r.tipo = 'fixa_anual' THEN
    IF r.mes IS NULL OR r.dia IS NULL THEN RETURN NULL; END IF;
    BEGIN
      RETURN make_date(_ano, r.mes::int, r.dia::int);
    EXCEPTION WHEN datetime_field_overflow THEN
      RETURN NULL; -- ex: 29/02 em ano não-bissexto
    END;
  ELSIF r.tipo = 'dinamica' THEN
    v_tipo := r.regra_json->>'tipo';
    IF v_tipo = 'pascoa_offset' THEN
      v_offset := COALESCE((r.regra_json->>'offset')::int, 0);
      RETURN public.dp_pascoa(_ano) + v_offset;
    END IF;
    RETURN NULL;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.dp_calc_data_regra(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_calc_data_regra(uuid, int) TO authenticated, service_role;

-- =========================================================================
-- 2) dp_gerar_bloqueios_ano(company_id, ano) -> int (qtd inseridas)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dp_gerar_bloqueios_ano(_company_id uuid, _ano int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  r record;
  v_data date;
  v_count int := 0;
  v_has_units boolean;
  u record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_admin_or_owner(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT id, nome FROM public.dp_bloqueio_regras
    WHERE company_id = _company_id AND ativo = true
  LOOP
    v_data := public.dp_calc_data_regra(r.id, _ano);
    IF v_data IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.dp_bloqueio_regra_unidades WHERE regra_id = r.id
    ) INTO v_has_units;

    IF v_has_units THEN
      FOR u IN
        SELECT unidade_id FROM public.dp_bloqueio_regra_unidades WHERE regra_id = r.id
      LOOP
        INSERT INTO public.dp_datas_bloqueadas
          (company_id, data, motivo, regra_id, unidade_id, criado_por)
        VALUES (_company_id, v_data, r.nome, r.id, u.unidade_id, _uid)
        ON CONFLICT DO NOTHING;
        IF FOUND THEN v_count := v_count + 1; END IF;
      END LOOP;
    ELSE
      INSERT INTO public.dp_datas_bloqueadas
        (company_id, data, motivo, regra_id, unidade_id, criado_por)
      VALUES (_company_id, v_data, r.nome, r.id, NULL, _uid)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.dp_gerar_bloqueios_ano(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_gerar_bloqueios_ano(uuid, int) TO authenticated, service_role;

-- =========================================================================
-- 3) dp_gerar_prioridades_aniversario(company_id, ano, mes) -> int
-- Regra: aniversariantes do mês primeiro, depois por data_admissao asc,
-- depois por nome. Priority começa em 1.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dp_gerar_prioridades_aniversario(
  _company_id uuid, _ano int, _mes int
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  v_count int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_company_admin_or_owner(_uid, _company_id) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF _mes < 1 OR _mes > 12 THEN
    RAISE EXCEPTION 'mes inválido' USING ERRCODE = '22023';
  END IF;

  -- Limpa prioridades anteriores desse mês/ano
  DELETE FROM public.dp_prioridade_aniversario
   WHERE company_id = _company_id AND ano = _ano AND mes = _mes;

  WITH ranked AS (
    SELECT
      c.id AS colaborador_id,
      (c.data_nascimento IS NOT NULL
        AND EXTRACT(MONTH FROM c.data_nascimento)::int = _mes) AS aniversariante,
      ROW_NUMBER() OVER (
        ORDER BY
          (c.data_nascimento IS NOT NULL
            AND EXTRACT(MONTH FROM c.data_nascimento)::int = _mes) DESC,
          c.data_admissao ASC NULLS LAST,
          c.nome ASC
      ) AS prio
    FROM public.dp_colaboradores c
    WHERE c.company_id = _company_id AND c.ativo = true
  )
  INSERT INTO public.dp_prioridade_aniversario
    (company_id, colaborador_id, ano, mes, prioridade, aniversariante)
  SELECT _company_id, colaborador_id, _ano, _mes, prio, aniversariante
  FROM ranked;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.dp_gerar_prioridades_aniversario(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_gerar_prioridades_aniversario(uuid, int, int) TO authenticated, service_role;

-- =========================================================================
-- 4) Trigger dp_validar_folga_insert
-- Bloqueios validados:
--   a) dp_datas_bloqueadas (empresa + data, unidade opcional)
--   b) dp_bloqueios (colaborador individualmente bloqueado no período,
--      tipos 'folga' ou 'todos')
--   c) dp_dia_config.limite_folgas (respeita unidade específica se houver;
--      folgas com extra=true não contam)
-- Não valida quando NEW.tipo IN ('ferias','licenca') ou NEW.extra=true.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dp_validar_folga_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unidade_id uuid;
  v_limite int;
  v_qtd int;
  v_bloqueada boolean;
  v_bloq_individual boolean;
BEGIN
  IF NEW.status = 'cancelada' THEN RETURN NEW; END IF;

  SELECT unidade_id INTO v_unidade_id
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  -- a) datas bloqueadas coletivas (empresa OU unidade)
  SELECT EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas b
    WHERE b.company_id = NEW.company_id
      AND b.data = NEW.data
      AND (b.unidade_id IS NULL OR b.unidade_id = v_unidade_id)
      AND b.liberada_por_solicitacao IS NULL
  ) INTO v_bloqueada;
  IF v_bloqueada AND NEW.tipo NOT IN ('ferias','licenca') AND NOT NEW.extra THEN
    RAISE EXCEPTION 'Data % está bloqueada para folgas nesta empresa/unidade', NEW.data
      USING ERRCODE = 'check_violation';
  END IF;

  -- b) bloqueio individual do colaborador
  SELECT EXISTS (
    SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id
      AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true
      AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data
      AND (bl.fim IS NULL OR bl.fim >= NEW.data)
  ) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Colaborador está bloqueado para marcar folga em %', NEW.data
      USING ERRCODE = 'check_violation';
  END IF;

  -- c) limite diário
  IF NOT NEW.extra AND NEW.tipo NOT IN ('ferias','licenca') THEN
    SELECT limite_folgas INTO v_limite
      FROM public.dp_dia_config
     WHERE company_id = NEW.company_id
       AND data = NEW.data
       AND (unidade_id = v_unidade_id OR unidade_id IS NULL)
     ORDER BY (unidade_id IS NOT NULL) DESC
     LIMIT 1;

    IF v_limite IS NOT NULL AND v_limite > 0 THEN
      SELECT COUNT(*) INTO v_qtd
        FROM public.dp_folgas f
       WHERE f.company_id = NEW.company_id
         AND f.data = NEW.data
         AND f.status <> 'cancelada'
         AND f.extra = false
         AND f.tipo NOT IN ('ferias','licenca')
         AND (v_unidade_id IS NULL OR EXISTS (
             SELECT 1 FROM public.dp_colaboradores c2
              WHERE c2.id = f.colaborador_id AND c2.unidade_id = v_unidade_id
           ));
      IF v_qtd >= v_limite THEN
        RAISE EXCEPTION 'Limite diário de folgas (%) atingido em %', v_limite, NEW.data
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dp_folgas_validar ON public.dp_folgas;
CREATE TRIGGER dp_folgas_validar
  BEFORE INSERT ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.dp_validar_folga_insert();

-- =========================================================================
-- 5) dp_processar_troca(troca_id) -> jsonb
-- Efetiva a troca atomicamente quando ambas as aprovações existem.
-- Regras:
--   - status atual deve permitir efetivação (pendente_gestor)
--   - colega_resposta = 'aprovada' AND gestor_resposta = 'aprovada'
--   - cancela folga do DESTINO em data_original (se houver) + log
--   - cria folga para SOLICITANTE em data_original (origem='troca')
--   - atualiza status para 'aprovada'
-- Roda como SECURITY DEFINER dentro de transação implícita.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.dp_processar_troca(_troca_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_folga_destino public.dp_folgas%ROWTYPE;
  v_nova_folga_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO t FROM public.dp_trocas WHERE id = _troca_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Troca não encontrada' USING ERRCODE = '22023'; END IF;

  IF NOT (private.is_company_admin_or_owner(_uid, t.company_id)
          OR public.is_super_admin(_uid)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF t.status <> 'pendente_gestor' THEN
    RAISE EXCEPTION 'Troca em status % não pode ser processada', t.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(t.colega_resposta, '') <> 'aprovada' THEN
    RAISE EXCEPTION 'Colega ainda não aprovou a troca' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(t.gestor_resposta, '') <> 'aprovada' THEN
    RAISE EXCEPTION 'Gestor ainda não aprovou a troca' USING ERRCODE = 'check_violation';
  END IF;

  -- Cancela folga do destino na data_original (se houver ativa)
  SELECT * INTO v_folga_destino
    FROM public.dp_folgas
   WHERE company_id = t.company_id
     AND colaborador_id = t.destino_id
     AND data = t.data_original
     AND status <> 'cancelada'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.dp_folgas
       SET status = 'cancelada', updated_at = now()
     WHERE id = v_folga_destino.id;

    INSERT INTO public.dp_folgas_canceladas
      (company_id, colaborador_id, folga_id, data, motivo, origem_cancelamento, cancelado_por)
    VALUES
      (t.company_id, t.destino_id, v_folga_destino.id, t.data_original,
       'Troca aprovada (id=' || t.id || ')', 'troca', _uid);
  END IF;

  -- Cria folga para solicitante na data_original
  INSERT INTO public.dp_folgas
    (company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES
    (t.company_id, t.solicitante_id, t.data_original,
     'normal', 'troca', 'agendada', false,
     'Troca aprovada (id=' || t.id || ')', _uid)
  RETURNING id INTO v_nova_folga_id;

  UPDATE public.dp_trocas
     SET status = 'aprovada', updated_at = now()
   WHERE id = t.id;

  RETURN jsonb_build_object(
    'troca_id', t.id,
    'status', 'aprovada',
    'folga_cancelada_id', v_folga_destino.id,
    'folga_nova_id', v_nova_folga_id
  );
END $$;
REVOKE ALL ON FUNCTION public.dp_processar_troca(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_processar_troca(uuid) TO authenticated, service_role;
