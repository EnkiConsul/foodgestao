-- D6: restrict confidential HR rows to existing company administrators or their subject.
-- Self-service policies are preserved; active collaborator required for mutations.
ALTER POLICY ocorrencias_select_empresa ON public.dp_ocorrencias USING (private.is_company_admin_or_owner(auth.uid(), company_id));
ALTER POLICY ocorrencia_eventos_select ON public.dp_ocorrencia_eventos USING (private.is_company_admin_or_owner(auth.uid(), company_id));
ALTER POLICY ocorrencia_coberturas_select ON public.dp_ocorrencia_coberturas USING (private.is_company_admin_or_owner(auth.uid(), company_id));
ALTER POLICY dp_sol_member_read ON public.dp_solicitacoes USING ((private.is_company_admin_or_owner(( SELECT auth.uid() AS uid), company_id) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = dp_solicitacoes.company_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))) OR is_super_admin(( SELECT auth.uid() AS uid))));
ALTER POLICY dp_sol_member_insert ON public.dp_solicitacoes WITH CHECK ((private.is_company_admin_or_owner(( SELECT auth.uid() AS uid), company_id) OR (EXISTS ( SELECT 1
   FROM companies c
  WHERE ((c.id = dp_solicitacoes.company_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))) OR is_super_admin(( SELECT auth.uid() AS uid))));

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_complementar(_ocorrencia_id uuid, _texto text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record; v_self uuid;
BEGIN
  IF COALESCE(btrim(_texto),'') = '' THEN RAISE EXCEPTION 'OCORRENCIA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) AND v_self IS DISTINCT FROM o.colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  UPDATE public.dp_ocorrencias SET justificativa_final = btrim(_texto) WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
  VALUES (o.company_id, _ocorrencia_id,
          CASE WHEN o.justificativa_final IS NULL THEN 'justificativa_enviada' ELSE 'justificativa_complementada' END,
          'justificativa_final', o.justificativa_final, btrim(_texto), auth.uid());
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_complementar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_complementar(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_confirmar(_ocorrencia_id uuid, _horario_real time without time zone DEFAULT NULL::time without time zone, _justificativa_final text DEFAULT NULL::text, _confirmar_falta boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record; v_novo public.dp_ocorrencia_tipo; v_min integer; v_self uuid;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) AND v_self IS DISTINCT FROM o.colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;

  v_novo := CASE o.tipo
    WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
    WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
    WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
    WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
    ELSE o.tipo END;

  IF NOT _confirmar_falta THEN
    UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''),'Não se confirmou')
      WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'ocorrencia_cancelada', auth.uid());
    RETURN;
  END IF;

  IF _horario_real IS NOT NULL AND o.horario_previsto IS NOT NULL THEN
    v_min := ABS(EXTRACT(EPOCH FROM (_horario_real - o.horario_previsto)) / 60)::int;
  END IF;

  UPDATE public.dp_ocorrencias SET
    tipo = v_novo,
    estado = 'confirmada',
    horario_real = COALESCE(_horario_real, horario_real),
    minutos = COALESCE(v_min, minutos),
    justificativa_final = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''), justificativa_final),
    relevancia_operacional = COALESCE((
      SELECT relevancia FROM public.dp_ocorrencia_tipo_config WHERE company_id = o.company_id AND tipo = v_novo
    ), true)
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'previsao_confirmada', 'tipo', o.tipo::text, v_novo::text,
          jsonb_build_object('horario_real', _horario_real, 'minutos', v_min), auth.uid());
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_confirmar(uuid,time without time zone,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_confirmar(uuid,time without time zone,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_analisar(_ocorrencia_id uuid, _status dp_ocorrencia_analise_status, _observacao text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
  UPDATE public.dp_ocorrencias SET analise_status = _status,
      analisado_por = CASE WHEN _status = 'pendente' THEN NULL ELSE auth.uid() END,
      analisado_em = CASE WHEN _status = 'pendente' THEN NULL ELSE now() END
   WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'analise_atualizada', 'analise_status', o.analise_status::text, _status::text,
          jsonb_build_object('observacao', NULLIF(btrim(COALESCE(_observacao,'')),'')), auth.uid());
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_analisar(uuid,dp_ocorrencia_analise_status,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_analisar(uuid,dp_ocorrencia_analise_status,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_classificar(_ocorrencia_id uuid, _impacta_assiduidade dp_ocorrencia_impacto DEFAULT NULL::dp_ocorrencia_impacto, _impacta_ferias dp_ocorrencia_impacto DEFAULT NULL::dp_ocorrencia_impacto)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;

  IF _impacta_assiduidade IS NOT NULL AND _impacta_assiduidade <> o.impacta_assiduidade THEN
    UPDATE public.dp_ocorrencias SET impacta_assiduidade = _impacta_assiduidade WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'impacto_alterado', 'impacta_assiduidade', o.impacta_assiduidade::text, _impacta_assiduidade::text, auth.uid());
  END IF;

  IF _impacta_ferias IS NOT NULL AND _impacta_ferias <> o.impacta_ferias THEN
    UPDATE public.dp_ocorrencias SET impacta_ferias = _impacta_ferias WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'impacto_alterado', 'impacta_ferias', o.impacta_ferias::text, _impacta_ferias::text, auth.uid());
  END IF;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_classificar(uuid,dp_ocorrencia_impacto,dp_ocorrencia_impacto) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_classificar(uuid,dp_ocorrencia_impacto,dp_ocorrencia_impacto) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_tratar(_ocorrencia_id uuid, _decisao text, _observacao text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record;
BEGIN
  IF _decisao NOT IN ('confirmada','ajuste_solicitado','nao_se_aplica') THEN
    RAISE EXCEPTION 'OCORRENCIA_TRATATIVA_INVALIDA';
  END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;

  UPDATE public.dp_ocorrencias SET
    tratativa_ponto = (_decisao <> 'nao_se_aplica'),
    tratativa_status = CASE WHEN _decisao = 'nao_se_aplica' THEN 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status
                            ELSE 'concluida'::public.dp_ocorrencia_tratativa_status END,
    tratativa_decisao = CASE WHEN _decisao = 'nao_se_aplica' THEN NULL ELSE _decisao END,
    tratativa_observacao = NULLIF(btrim(COALESCE(_observacao,'')),'')
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'tratativa_concluida', 'tratativa_decisao', o.tratativa_decisao, _decisao,
          jsonb_build_object('observacao', NULLIF(btrim(COALESCE(_observacao,'')),'')), auth.uid());
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_tratar(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_tratar(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_cancelar(_ocorrencia_id uuid, _motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record; v_self uuid; v_prazo smallint;
BEGIN
  IF COALESCE(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'OCORRENCIA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) THEN
    IF v_self IS DISTINCT FROM o.colaborador_id THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
    IF o.analise_status <> 'pendente' THEN RAISE EXCEPTION 'OCORRENCIA_JA_ANALISADA'; END IF;
    SELECT prazo_retroativo_dias INTO v_prazo FROM public.dp_ocorrencia_config(o.company_id);
    IF o.data_operacional < (CURRENT_DATE - v_prazo) THEN RAISE EXCEPTION 'OCORRENCIA_PRAZO_RETROATIVO'; END IF;
  END IF;
  UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
    motivo_cancelamento = btrim(_motivo) WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, valor_novo, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'ocorrencia_cancelada', btrim(_motivo), auth.uid());
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cancelar(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cancelar(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_ocorrencias_indicadores(_company_id uuid, _inicio date, _fim date, _unidade_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT private.is_company_admin_or_owner(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;

  WITH base AS (
    SELECT o.*
      FROM public.dp_ocorrencias o
     WHERE o.company_id = _company_id
       AND o.data_operacional BETWEEN _inicio AND _fim
       AND o.estado <> 'cancelada'
       AND (_unidade_id IS NULL OR o.unidade_id = _unidade_id)
  ), cob AS (
    SELECT c.*, b.id AS oc_id
      FROM public.dp_ocorrencia_coberturas c
      JOIN base b ON b.id = c.ocorrencia_id
     WHERE c.status <> 'recusada'
  )
  SELECT jsonb_build_object(
    'atrasos', (SELECT count(*) FROM base WHERE tipo IN ('atraso','previsao_atraso')),
    'atraso_minutos', (SELECT COALESCE(sum(minutos),0) FROM base WHERE tipo IN ('atraso','previsao_atraso')),
    'faltas', (SELECT count(*) FROM base WHERE tipo IN ('falta','previsao_falta')),
    'ausencias_justificadas', (SELECT count(*) FROM base WHERE tipo IN ('ausencia_justificada','atestado')),
    'saidas_antecipadas', (SELECT count(*) FROM base WHERE tipo IN ('saida_antecipada','previsao_saida_antecipada')),
    'ausencias_cobertas', (SELECT count(DISTINCT oc_id) FROM cob),
    'ausencias_descobertas', (
      SELECT count(*) FROM base b
       WHERE b.tipo IN ('falta','previsao_falta','ausencia_justificada','atestado')
         AND NOT EXISTS (SELECT 1 FROM cob c WHERE c.oc_id = b.id)
    ),
    'coberturas_previstas', (SELECT count(*) FROM cob WHERE execucao_status = 'prevista'),
    'coberturas_realizadas', (SELECT count(*) FROM cob WHERE execucao_status = 'realizada'),
    'coberturas_nao_realizadas', (SELECT count(*) FROM cob WHERE execucao_status = 'nao_realizada'),
    'pendentes', (
      SELECT count(*) FROM base
       WHERE estado = 'aguardando_confirmacao'
          OR analise_status = 'pendente'
          OR (tratativa_ponto AND tratativa_status = 'pendente')
    ),
    'total', (SELECT count(*) FROM base)
  ) INTO v_res;

  RETURN v_res;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencias_indicadores(uuid,date,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencias_indicadores(uuid,date,date,uuid) TO authenticated, service_role;

-- Internal helpers have no client-side callers; owner-executed triggers/RPCs retain access.
REVOKE EXECUTE ON FUNCTION public.dp_notificar_criador_ocorrencia(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_atestado_aplicar(uuid) FROM PUBLIC, anon, authenticated;

-- TRUNCATE bypasses RLS and is never required by browser CRUD.
DO $d6$
DECLARE t record;
BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND left(c.relname,3)='dp_'
 LOOP
  EXECUTE format('REVOKE TRUNCATE ON TABLE %I.%I FROM PUBLIC, anon, authenticated',t.nspname,t.relname);
 END LOOP;
END
$d6$;
NOTIFY pgrst, 'reload schema';
