CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_self boolean := (NEW.origem = 'solicitacao'::public.dp_folga_origem);
  v_contingencia boolean := COALESCE(current_setting('dp.folga_auto_contingencia', true), 'off') = 'on';
  v_ignora_bloqueio boolean := COALESCE(current_setting('dp.folga_ignora_bloqueio', true), 'off') = 'on';
  v_excedente boolean := COALESCE(current_setting('dp.folga_excedente_autorizado', true), 'off') = 'on';
  v_limite int; v_qtd int; v_mensais int; v_teto int; v_bloq record; v_liberada boolean;
  v_fixa int; v_aniv record; v_bloq_individual boolean; v_socio boolean; v_regra_alvo text;
BEGIN
  IF NEW.status = 'cancelada' THEN RETURN NEW; END IF;

  SELECT unidade_id, folga_fixa_semana, lower(coalesce(vinculo_label, '')) IN ('socio', 'sócio')
    INTO v_unidade, v_fixa, v_socio
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  IF NEW.tipo NOT IN ('ferias','licenca') AND NOT NEW.extra AND NOT v_ignora_bloqueio THEN
    SELECT motivo, liberada_por_solicitacao, liberada INTO v_bloq
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id AND data = NEW.data
       AND (unidade_id IS NULL OR unidade_id = v_unidade) AND regra_id IS NULL
     ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST LIMIT 1;
    IF v_self AND FOUND AND v_bloq.liberada_por_solicitacao IS NULL AND COALESCE(v_bloq.liberada, false) = false THEN
      RAISE EXCEPTION 'Data % está bloqueada administrativamente.', NEW.data USING ERRCODE = 'check_violation';
    END IF;
    IF v_self AND public.dp_regra_bloqueia_data(NEW.company_id, v_unidade, NEW.data) THEN
      SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false)) INTO v_liberada
        FROM public.dp_datas_bloqueadas
       WHERE company_id = NEW.company_id AND data = NEW.data
         AND (unidade_id IS NULL OR unidade_id = v_unidade)
       ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST LIMIT 1;
      IF NOT COALESCE(v_liberada, false) THEN
        RAISE EXCEPTION 'Esta data está bloqueada por regra da empresa.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    v_regra_alvo := private.dp_regra_bloqueia_colaborador(NEW.colaborador_id, NEW.data);
    IF v_regra_alvo IS NOT NULL THEN
      RAISE EXCEPTION 'Esta data não está disponível para folga.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data AND (bl.fim IS NULL OR bl.fim >= NEW.data)) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Colaborador está bloqueado para marcar folga em %', NEW.data USING ERRCODE = 'check_violation';
  END IF;

  IF NOT NEW.extra AND NEW.tipo NOT IN ('ferias','licenca') AND NOT v_contingencia AND NOT v_excedente THEN
    PERFORM private.dp_folga_lock_vaga(NEW.company_id, v_unidade, NEW.data);
    SELECT limite_folgas INTO v_limite FROM public.dp_dia_config
     WHERE company_id = NEW.company_id AND data = NEW.data
       AND (unidade_id = v_unidade OR unidade_id IS NULL)
     ORDER BY (unidade_id IS NOT NULL) DESC LIMIT 1;
    IF v_limite IS NOT NULL AND v_limite > 0
       AND NOT (v_wd = 0 AND 0::smallint = ANY (COALESCE(public.dp_dias_fixos_folga(NEW.colaborador_id, NEW.data), '{}'::smallint[]))) THEN
      SELECT count(*) INTO v_qtd FROM public.dp_colaboradores c
       WHERE c.company_id = NEW.company_id AND c.deleted_at IS NULL
         AND (v_unidade IS NULL OR c.unidade_id = v_unidade)
         AND c.id <> NEW.colaborador_id
         AND private.dp_folga_ocupa_vaga(c.id, NEW.data);
      IF v_qtd >= v_limite THEN
        RAISE EXCEPTION 'Limite diário de folgas (%) atingido em %', v_limite, NEW.data USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF v_self AND NOT COALESCE(v_socio, false) THEN
    IF v_wd IN (0, 6) AND NOT NEW.extra THEN
      SELECT folgas_fds_por_mes INTO v_teto FROM public.dp_config_dp WHERE company_id = NEW.company_id;
      v_teto := COALESCE(v_teto, 1);
      IF v_teto > 0 THEN
        SELECT count(*) INTO v_mensais FROM public.dp_folgas
         WHERE colaborador_id = NEW.colaborador_id AND extra = false AND status <> 'cancelada'
           AND EXTRACT(DOW FROM data) IN (0, 6)
           AND date_trunc('month', data) = date_trunc('month', NEW.data);
        IF v_mensais >= v_teto THEN
          RAISE EXCEPTION 'Você já atingiu o limite de % folga(s) de fim de semana neste mês.', v_teto USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
    IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
      RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT pa.colaborador_id INTO v_aniv FROM public.dp_prioridade_aniversario pa
      JOIN public.dp_colaboradores c ON c.id = pa.colaborador_id
     WHERE pa.company_id = NEW.company_id AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
       AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int AND pa.aniversariante = true
       AND c.data_nascimento IS NOT NULL AND EXTRACT(DAY FROM c.data_nascimento) = EXTRACT(DAY FROM NEW.data)
     LIMIT 1;
    IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
      RAISE EXCEPTION 'Data reservada para aniversariante.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;