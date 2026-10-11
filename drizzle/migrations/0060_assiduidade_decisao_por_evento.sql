ALTER TABLE public.dp_solicitacoes
  ADD COLUMN IF NOT EXISTS assiduidade_perde boolean,
  ADD COLUMN IF NOT EXISTS assiduidade_justificativa text;

COMMENT ON COLUMN public.dp_colaboradores.assiduidade_criterio IS 'DEPRECATED: decisão de assiduidade agora é tomada pelo gestor em cada evento';
COMMENT ON COLUMN public.dp_colaboradores.assiduidade_tolerancia_min IS 'DEPRECATED: decisão de assiduidade agora é tomada pelo gestor em cada evento';
COMMENT ON COLUMN public.dp_colaboradores.assiduidade_max_atrasos IS 'DEPRECATED: decisão de assiduidade agora é tomada pelo gestor em cada evento';
COMMENT ON COLUMN public.dp_colaboradores.assiduidade_considera_atestado IS 'DEPRECATED: decisão de assiduidade agora é tomada pelo gestor em cada evento';
COMMENT ON COLUMN public.dp_colaboradores.assiduidade_max_atestados IS 'DEPRECATED: decisão de assiduidade agora é tomada pelo gestor em cada evento';

-- Risco: só existe com prêmio cadastrado; falta, atestado e atrasos sempre vão para decisão do gestor.
CREATE OR REPLACE FUNCTION private.dp_assiduidade_risco(_colaborador_id uuid, _tipo dp_ocorrencia_tipo, _minutos integer DEFAULT NULL::integer)
 RETURNS TABLE(risco boolean, motivo text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record;
BEGIN
  SELECT premio_assiduidade, premio_assiduidade_valor, vinculo_label INTO c
    FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF c IS NULL OR COALESCE(c.premio_assiduidade,false) = false
     OR COALESCE(c.premio_assiduidade_valor,0) <= 0
     OR lower(COALESCE(c.vinculo_label,'')) IN ('socio','sócio') THEN
    RETURN QUERY SELECT false, NULL::text; RETURN;
  END IF;
  IF _tipo IN ('falta','previsao_falta') THEN
    RETURN QUERY SELECT true, 'Falta registrada — por padrão perde o prêmio de assiduidade; o gestor decide.'::text; RETURN;
  END IF;
  IF _tipo = 'atestado' THEN
    RETURN QUERY SELECT true, 'Atestado apresentado — por padrão perde o prêmio de assiduidade; o gestor pode abonar.'::text; RETURN;
  END IF;
  IF _tipo IN ('atraso','previsao_atraso','atraso_intervalo','previsao_atraso_intervalo',
               'saida_antecipada','previsao_saida_antecipada') THEN
    RETURN QUERY SELECT true,
      (CASE WHEN _minutos IS NULL THEN 'Atraso registrado'
            ELSE format('Atraso de %s minuto(s)', _minutos) END
       || ' — por padrão perde o prêmio de assiduidade; o gestor decide.')::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT false, NULL::text;
END;
$function$;

-- Padrão do sistema por evento: true = perde, false = mantém.
CREATE OR REPLACE FUNCTION private.dp_assiduidade_padrao_perde(_ocorrencia_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT NOT COALESCE((
    SELECT s.motivo ILIKE 'Liberação do Gestor%'
      FROM public.dp_ocorrencias o JOIN public.dp_solicitacoes s ON s.id = o.solicitacao_id
     WHERE o.id = _ocorrencia_id), false);
$$;
REVOKE ALL ON FUNCTION private.dp_assiduidade_padrao_perde(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_assiduidade_decidir(p_ocorrencia_id uuid, p_perde boolean, p_observacao text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o record; v_obs text; v_user uuid; v_comp text; v_padrao boolean;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_perde IS NULL THEN RAISE EXCEPTION 'ASSIDUIDADE_DADOS_OBRIGATORIOS'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = p_ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  PERFORM private.dp_regras_admin(o.company_id);
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;
  IF NOT o.assiduidade_risco THEN RAISE EXCEPTION 'ASSIDUIDADE_SEM_RISCO'; END IF;

  v_obs := NULLIF(btrim(COALESCE(p_observacao,'')),'');
  v_padrao := private.dp_assiduidade_padrao_perde(p_ocorrencia_id);
  IF p_perde IS DISTINCT FROM v_padrao AND v_obs IS NULL THEN
    RAISE EXCEPTION 'ASSIDUIDADE_MOTIVO_OBRIGATORIO';
  END IF;

  IF o.assiduidade_decidido_em IS NOT NULL THEN
    IF (o.impacta_assiduidade = 'sim') IS NOT DISTINCT FROM p_perde
       AND COALESCE(o.assiduidade_observacao,'') IS NOT DISTINCT FROM COALESCE(v_obs,'') THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'ASSIDUIDADE_JA_DECIDIDA';
  END IF;

  UPDATE public.dp_ocorrencias SET
    impacta_assiduidade = CASE WHEN p_perde THEN 'sim'::public.dp_ocorrencia_impacto ELSE 'nao'::public.dp_ocorrencia_impacto END,
    assiduidade_observacao = v_obs,
    assiduidade_decidido_por = auth.uid(),
    assiduidade_decidido_em = now()
  WHERE id = p_ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, p_ocorrencia_id, 'assiduidade_decidida', 'impacta_assiduidade',
          o.impacta_assiduidade::text, CASE WHEN p_perde THEN 'sim' ELSE 'nao' END,
          jsonb_build_object('observacao', v_obs, 'motivo_risco', o.assiduidade_risco_motivo,
                             'padrao_sistema', CASE WHEN v_padrao THEN 'perde' ELSE 'mantem' END,
                             'alterou_padrao', p_perde IS DISTINCT FROM v_padrao), auth.uid());

  IF p_perde THEN
    SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = o.colaborador_id;
    v_comp := to_char(o.data_operacional, 'MM/YYYY');
    INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave)
    VALUES (o.company_id, v_user, o.colaborador_id, 'assiduidade_decidida', 'Prêmio de assiduidade afetado',
      format('A ocorrência de %s foi analisada e vai descontar o prêmio de assiduidade da competência %s.%s',
             to_char(o.data_operacional, 'DD/MM/YYYY'), v_comp,
             CASE WHEN v_obs IS NOT NULL THEN ' Observação: ' || v_obs ELSE '' END),
      'dp_ocorrencias', p_ocorrencia_id, false, 'assiduidade_decidida:' || p_ocorrencia_id::text)
    ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;
END;
$function$;

-- Ausências vindas do calendário/atestados: com prêmio, vão para decisão do gestor (ou já usam a decisão gravada).
CREATE OR REPLACE FUNCTION private.dp_ocorrencia_assiduidade_da_solicitacao()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; c record;
BEGIN
  IF NEW.solicitacao_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.solicitacao_id IS NOT DISTINCT FROM OLD.solicitacao_id THEN RETURN NEW; END IF;
  SELECT tipo, motivo, assiduidade_perde, assiduidade_justificativa INTO s FROM public.dp_solicitacoes WHERE id = NEW.solicitacao_id;
  IF s IS NULL OR s.tipo IN ('folga','ferias','adiantamento','documento') THEN RETURN NEW; END IF;
  IF COALESCE(s.motivo,'') ILIKE 'Ausência do Sócio%' THEN RETURN NEW; END IF;
  SELECT premio_assiduidade, premio_assiduidade_valor, vinculo_label INTO c FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF c IS NULL OR NOT COALESCE(c.premio_assiduidade,false) OR COALESCE(c.premio_assiduidade_valor,0) <= 0
     OR lower(COALESCE(c.vinculo_label,'')) IN ('socio','sócio') THEN RETURN NEW; END IF;

  NEW.assiduidade_risco := true;
  NEW.assiduidade_risco_motivo := CASE
    WHEN COALESCE(s.motivo,'') ILIKE 'Liberação do Gestor%' THEN 'Liberação do Gestor — por padrão mantém o prêmio de assiduidade.'
    WHEN s.tipo = 'atestado' THEN 'Atestado apresentado — por padrão perde o prêmio de assiduidade; o gestor pode abonar.'
    ELSE 'Licença ou afastamento — por padrão perde o prêmio de assiduidade; o gestor pode abonar.' END;
  IF s.assiduidade_perde IS NOT NULL THEN
    NEW.impacta_assiduidade := CASE WHEN s.assiduidade_perde THEN 'sim'::public.dp_ocorrencia_impacto ELSE 'nao'::public.dp_ocorrencia_impacto END;
    NEW.assiduidade_observacao := s.assiduidade_justificativa;
    NEW.assiduidade_decidido_em := now();
    NEW.assiduidade_decidido_por := auth.uid();
  ELSE
    NEW.impacta_assiduidade := 'aguardando';
    NEW.assiduidade_observacao := NULL;
    NEW.assiduidade_decidido_em := NULL;
    NEW.assiduidade_decidido_por := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.dp_ocorrencia_assiduidade_da_solicitacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS dp_ocorrencia_assiduidade_solicitacao_trg ON public.dp_ocorrencias;
CREATE TRIGGER dp_ocorrencia_assiduidade_solicitacao_trg
  BEFORE INSERT OR UPDATE OF solicitacao_id ON public.dp_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_assiduidade_da_solicitacao();

-- Decisão do gestor no cadastro/aprovação: grava na solicitação e aplica às ocorrências já geradas.
CREATE OR REPLACE FUNCTION public.dp_solicitacao_assiduidade_definir(p_id uuid, p_perde boolean, p_justificativa text DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s record; r record; v_obs text; v_padrao boolean; n integer := 0;
BEGIN
  IF p_id IS NULL OR p_perde IS NULL THEN RAISE EXCEPTION 'ASSIDUIDADE_DADOS_OBRIGATORIOS'; END IF;
  SELECT * INTO s FROM public.dp_solicitacoes WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  PERFORM private.dp_regras_admin(s.company_id);
  v_obs := NULLIF(btrim(COALESCE(p_justificativa,'')),'');
  v_padrao := NOT (COALESCE(s.motivo,'') ILIKE 'Liberação do Gestor%');
  IF p_perde IS DISTINCT FROM v_padrao AND v_obs IS NULL THEN RAISE EXCEPTION 'ASSIDUIDADE_MOTIVO_OBRIGATORIO'; END IF;

  UPDATE public.dp_solicitacoes SET assiduidade_perde = p_perde, assiduidade_justificativa = v_obs WHERE id = p_id;

  FOR r IN SELECT id FROM public.dp_ocorrencias
            WHERE solicitacao_id = p_id AND estado <> 'cancelada'
              AND assiduidade_risco AND assiduidade_decidido_em IS NULL LOOP
    PERFORM public.dp_ocorrencia_assiduidade_decidir(r.id, p_perde, v_obs);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.dp_solicitacao_assiduidade_definir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_assiduidade_definir(uuid, boolean, text) TO authenticated;