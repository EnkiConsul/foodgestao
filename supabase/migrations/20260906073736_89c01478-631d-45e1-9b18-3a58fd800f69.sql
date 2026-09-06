-- M31: prioridade por níveis nas convocações
ALTER TABLE public.dp_convocacao_destinatarios
  ADD COLUMN IF NOT EXISTS nivel integer NOT NULL DEFAULT 1;

ALTER TABLE public.dp_convocacao_destinatarios
  DROP CONSTRAINT IF EXISTS dp_convocacao_destinatarios_nivel_check;
ALTER TABLE public.dp_convocacao_destinatarios
  ADD CONSTRAINT dp_convocacao_destinatarios_nivel_check CHECK (nivel BETWEEN 1 AND 9);

ALTER TABLE public.dp_convocacao_grupos
  ADD COLUMN IF NOT EXISTS intervalo_niveis_horas integer;
ALTER TABLE public.dp_convocacao_grupos
  DROP CONSTRAINT IF EXISTS dp_convocacao_grupos_intervalo_niveis_check;
ALTER TABLE public.dp_convocacao_grupos
  ADD CONSTRAINT dp_convocacao_grupos_intervalo_niveis_check
  CHECK (intervalo_niveis_horas IS NULL OR (intervalo_niveis_horas BETWEEN 1 AND 168));

ALTER TABLE public.dp_convocacoes
  ADD COLUMN IF NOT EXISTS nivel_prioridade integer NOT NULL DEFAULT 1;

-- ------------------------------------------------------------------ destinatários com nível
DROP FUNCTION IF EXISTS public.dp_convocacao_definir_destinatarios(uuid, uuid[], timestamptz);

CREATE OR REPLACE FUNCTION public.dp_convocacao_definir_destinatarios(
  p_grupo_id uuid,
  p_colaboradores uuid[],
  p_expected_updated_at timestamptz,
  p_niveis jsonb DEFAULT NULL,
  p_intervalo_niveis_horas integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_grupo public.dp_convocacao_grupos;
  v_ids uuid[];
  v_ativos jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente rascunhos aceitam mudança de destinatários.' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS NULL OR v_grupo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa.' USING ERRCODE = '40001';
  END IF;

  IF p_intervalo_niveis_horas IS NOT NULL
     AND (p_intervalo_niveis_horas < 1 OR p_intervalo_niveis_horas > 168) THEN
    RAISE EXCEPTION 'INVALID_INPUT: o intervalo entre níveis deve ficar entre 1 e 168 horas.' USING ERRCODE = '22023';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_colaboradores, '{}'::uuid[])) AS x WHERE x IS NOT NULL)
    INTO v_ids;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_colaboradores c
        WHERE c.id = t.id AND c.company_id = v_company
          AND c.ativo IS NOT FALSE
          AND public.dp_regime_convocavel(c.regime)
          AND c.unidade_id IS NOT NULL
          AND c.unidade_id = v_grupo.unidade_id)
  ) THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: há pessoa fora da empresa, inativa, de outra unidade ou sem vínculo convocável.'
      USING ERRCODE = '22023';
  END IF;

  IF p_niveis IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_niveis) AS t(x)
     WHERE COALESCE((x->>'nivel')::int, 1) < 1 OR COALESCE((x->>'nivel')::int, 1) > 9
        OR NOT ((x->>'colaborador_id')::uuid = ANY (v_ids))
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT: nível de prioridade inválido ou de pessoa não selecionada.' USING ERRCODE = '22023';
  END IF;

  -- soft remove do que saiu (global e overrides do grupo)
  UPDATE public.dp_convocacao_destinatarios d
     SET removido_em = now(), removido_por = v_uid
   WHERE d.grupo_id = v_grupo.id
     AND d.company_id = v_company
     AND d.removido_em IS NULL
     AND NOT (d.colaborador_id = ANY (v_ids));

  -- insere o que entrou; mantém iguais
  INSERT INTO public.dp_convocacao_destinatarios(
    company_id, grupo_id, ocorrencia_id, colaborador_id, created_by, nivel)
  SELECT v_company, v_grupo.id, NULL, t.id, v_uid,
         COALESCE((SELECT (x->>'nivel')::int
                     FROM jsonb_array_elements(COALESCE(p_niveis, '[]'::jsonb)) AS e(x)
                    WHERE (x->>'colaborador_id')::uuid = t.id
                    LIMIT 1), 1)
    FROM unnest(v_ids) AS t(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.dp_convocacao_destinatarios d
      WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
        AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
        AND d.colaborador_id = t.id);

  -- atualiza o nível de quem já estava selecionado
  UPDATE public.dp_convocacao_destinatarios d
     SET nivel = n.nivel, updated_at = now()
    FROM (
      SELECT (x->>'colaborador_id')::uuid AS colaborador_id,
             COALESCE((x->>'nivel')::int, 1) AS nivel
        FROM jsonb_array_elements(COALESCE(p_niveis, '[]'::jsonb)) AS e(x)
    ) n
   WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
     AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
     AND d.colaborador_id = n.colaborador_id
     AND d.nivel <> n.nivel;

  UPDATE public.dp_convocacao_grupos
     SET publico_modo = 'selecionado',
         intervalo_niveis_horas = COALESCE(p_intervalo_niveis_horas, intervalo_niveis_horas),
         updated_at = now()
   WHERE id = v_grupo.id AND company_id = v_company
  RETURNING * INTO v_grupo;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_grupo.id, NULL, 'destinatarios_definidos',
    jsonb_build_object('quantidade', COALESCE(array_length(v_ids, 1), 0),
                       'intervalo_niveis_horas', v_grupo.intervalo_niveis_horas));

  SELECT COALESCE(jsonb_agg(d.colaborador_id ORDER BY d.colaborador_id), '[]'::jsonb)
    INTO v_ativos
    FROM public.dp_convocacao_destinatarios d
   WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
     AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo.id,
    'updated_at', v_grupo.updated_at,
    'publico_modo', v_grupo.publico_modo,
    'intervalo_niveis_horas', v_grupo.intervalo_niveis_horas,
    'destinatarios', v_ativos);
END;
$function$;

-- ------------------------------------------------------------------ liberação escalonada
CREATE OR REPLACE FUNCTION public.dp_convocacao_aplicar_nivel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nivel integer;
  v_horas integer;
  v_base timestamptz;
BEGIN
  IF NEW.ocorrencia_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(d.nivel, 1), g.intervalo_niveis_horas
    INTO v_nivel, v_horas
    FROM public.dp_convocacao_ocorrencias o
    JOIN public.dp_convocacao_grupos g ON g.id = o.grupo_id
    LEFT JOIN public.dp_convocacao_destinatarios d
      ON d.grupo_id = g.id
     AND d.ocorrencia_id IS NULL
     AND d.removido_em IS NULL
     AND d.colaborador_id = NEW.colaborador_id
   WHERE o.id = NEW.ocorrencia_id
   LIMIT 1;

  NEW.nivel_prioridade := COALESCE(v_nivel, 1);

  IF COALESCE(v_horas, 0) > 0 AND COALESCE(v_nivel, 1) > 1 THEN
    v_base := COALESCE(NEW.disponibilizada_em, now())
              + make_interval(hours => v_horas * (COALESCE(v_nivel, 1) - 1));
    NEW.disponibilizada_em := v_base;
    NEW.enviada_em := v_base;
    IF NEW.prazo_resposta IS NOT NULL AND NEW.prazo_resposta < v_base THEN
      NEW.prazo_resposta := v_base;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dp_convocacao_aplicar_nivel ON public.dp_convocacoes;
CREATE TRIGGER trg_dp_convocacao_aplicar_nivel
  BEFORE INSERT ON public.dp_convocacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_convocacao_aplicar_nivel();

CREATE OR REPLACE FUNCTION public.dp_convocacao_bloqueia_resposta_antecipada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status::text IN ('aceita', 'recusada')
     AND NEW.disponibilizada_em IS NOT NULL
     AND NEW.disponibilizada_em > now() THEN
    RAISE EXCEPTION 'OFFER_NOT_AVAILABLE_YET: esta convocação ainda não foi liberada para esta pessoa.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dp_convocacao_resposta_antecipada ON public.dp_convocacoes;
CREATE TRIGGER trg_dp_convocacao_resposta_antecipada
  BEFORE UPDATE ON public.dp_convocacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_convocacao_bloqueia_resposta_antecipada();

-- ------------------------------------------------------------------ portal só vê o que já foi liberado
CREATE OR REPLACE FUNCTION public.dp_convocacao_minhas_ofertas()
RETURNS TABLE(id uuid, data date, status text, entrada time without time zone, saida time without time zone, intervalo_minutos integer, termina_no_dia_seguinte boolean, carga_prevista_horas numeric, prazo_resposta timestamp with time zone, inicio_previsto timestamp with time zone, fim_previsto timestamp with time zone, visualizada_em timestamp with time zone, respondida_em timestamp with time zone, motivo_recusa text, observacao text, compatibilidade text, regime_snapshot text, remuneracao_snapshot jsonb, timezone_snapshot text, modalidade text, vagas integer, vagas_restantes integer, necessidade_entrada time without time zone, necessidade_saida time without time zone, necessidade_termina_no_dia_seguinte boolean, cargo_nome text, unidade_nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.data, c.status::text, c.entrada, c.saida, c.intervalo_minutos,
    c.termina_no_dia_seguinte, c.carga_prevista_horas, c.prazo_resposta,
    c.inicio_previsto, c.fim_previsto, c.visualizada_em, c.respondida_em,
    c.motivo_recusa, c.observacao, c.compatibilidade, c.regime_snapshot::text,
    c.remuneracao_snapshot, c.timezone_snapshot,
    g.modalidade::text,
    o.vagas,
    GREATEST(0, COALESCE(o.vagas, 1) - (
      SELECT count(*)::int FROM public.dp_convocacoes a
       WHERE a.ocorrencia_id = o.id AND a.status = 'aceita')),
    o.necessidade_entrada, o.necessidade_saida,
    o.necessidade_termina_no_dia_seguinte,
    car.nome::text, un.nome::text
  FROM public.dp_convocacoes c
  LEFT JOIN public.dp_convocacao_ocorrencias o ON o.id = c.ocorrencia_id
  LEFT JOIN public.dp_convocacao_grupos g ON g.id = o.grupo_id
  LEFT JOIN public.dp_cargos car ON car.id = COALESCE(o.cargo_id, (
    SELECT cc.cargo_id FROM public.dp_colaboradores cc WHERE cc.id = c.colaborador_id))
  LEFT JOIN public.dp_unidades un ON un.id = c.unidade_id
  WHERE c.colaborador_id = public.dp_colaborador_of(auth.uid())
    AND (c.disponibilizada_em IS NULL OR c.disponibilizada_em <= now())
  ORDER BY c.data DESC, c.entrada;
$function$;