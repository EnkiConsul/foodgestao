DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.dp_folga_atribuir_admin_v2(uuid,date,text,uuid,date,text,boolean,text)'::regprocedure) INTO definition;
  IF position('v_regime text;' in definition)=0 OR position('p_extra => (p_modo = ''extra'')' in definition)=0 THEN RAISE EXCEPTION 'Definição de triagem inesperada'; END IF;
  definition := replace(definition, 'v_regime text;', 'v_regime text; v_forma text; v_vinculo text; v_compensa boolean; v_individual boolean;');
  definition := replace(definition, '(''extra'', ''substituir_fds'', ''troca_semanal'')', '(''extra'', ''substituir_fds'', ''troca_semanal'', ''compensatoria'')');
  definition := replace(definition, 'c.regime::text INTO v_company, v_unidade, v_regime', 'c.regime::text, c.forma_pagamento::text, c.vinculo_label INTO v_company, v_unidade, v_regime, v_forma, v_vinculo');
  definition := replace(definition, '  IF p_modo = ''substituir_fds'' THEN', $guard$
  IF lower(coalesce(v_vinculo,'')) IN ('socio','sócio') OR NOT (v_regime IN ('clt','estagio','temporario') OR (v_regime='freelancer' AND v_forma='mensalista')) THEN
    RAISE EXCEPTION 'FOLGA_REGIME_INELEGIVEL: registre ausência ou indisponibilidade para este vínculo.' USING ERRCODE='22023';
  END IF;
  IF p_modo='compensatoria' THEN
    SELECT compensa_feriados INTO v_compensa FROM public.dp_unidades WHERE id=v_unidade AND company_id=v_company;
    SELECT usa_compensa_feriados INTO v_individual FROM public.dp_colaborador_compensacao WHERE colaborador_id=p_colaborador AND company_id=v_company;
    IF NOT (v_regime='clt' OR (v_regime='freelancer' AND v_forma='mensalista')) OR NOT coalesce(v_compensa,false) OR v_individual IS FALSE THEN
      RAISE EXCEPTION 'COMPENSACAO_INELEGIVEL: compensação não habilitada para este colaborador.' USING ERRCODE='22023';
    END IF;
    IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA: informe a justificativa da folga compensatória.' USING ERRCODE='22023'; END IF;
  END IF;
  IF p_modo = 'substituir_fds' THEN$guard$);
  definition := replace(definition, '  ELSE
    v_obs := btrim(concat_ws('' '', ''Folga extra.''', '  ELSIF p_modo = ''compensatoria'' THEN
    v_obs := ''Folga compensatória autorizada. '' || btrim(p_motivo);
  ELSE
    v_obs := btrim(concat_ws('' '', ''Folga extra.''');
  definition := replace(definition, '  PERFORM public.insert_audit_log(''folga_atribuida_admin_triagem''', $persist$
  IF p_modo='compensatoria' THEN
    UPDATE public.dp_folgas SET direito_origem='compensacao_feriado', extra=false, observacao=v_obs WHERE id=(v_res->>'folga_id')::uuid AND company_id=v_company AND colaborador_id=p_colaborador;
    PERFORM private.dp_folga_ocorrencia((v_res->>'folga_id')::uuid,NULL,NULL);
  END IF;
  PERFORM public.insert_audit_log('folga_atribuida_admin_triagem'$persist$);
  EXECUTE definition;
END $migration$;

DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('private.dp_folga_ocorrencia(uuid,uuid,uuid)'::regprocedure) INTO definition;
 IF position('WHEN f.tipo::text=''compensatoria''' in definition)=0 THEN RAISE EXCEPTION 'Definição de evidência inesperada'; END IF;
 definition:=replace(definition, 'WHEN f.tipo::text=''compensatoria''', 'WHEN f.direito_origem=''compensacao_feriado'' OR f.tipo::text=''compensatoria''');
 definition:=replace(definition, '''Compensação de feriado trabalhado autorizada''', '''Folga compensatória autorizada''');
 definition:=replace(definition, 'titulo || ''. Justifica a ausência', 'titulo || coalesce('' — '' || nullif(btrim(f.observacao),''''),'''') || ''. Justifica a ausência');
 EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.dp_notif_solicitacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_nome text; v_descricao text; v_titulo text; v_troca boolean;
BEGIN
 SELECT nome INTO v_nome FROM public.dp_colaboradores WHERE id=NEW.colaborador_id AND company_id=NEW.company_id;
 v_troca:=NEW.tipo::text='folga' AND NEW.data_fim IS NOT NULL;
 v_descricao:=CASE WHEN v_troca THEN format('Folga atual: %s (passará a trabalhar). Folga desejada: %s. Motivo: %s',to_char(NEW.data_fim,'DD/MM/YYYY'),to_char(NEW.data_alvo,'DD/MM/YYYY'),coalesce(NEW.motivo,'Não informado')) ELSE 'Tipo: ' || NEW.tipo::text END;
 IF TG_OP='INSERT' AND NEW.status::text='pendente' THEN
   v_titulo:=CASE WHEN v_troca THEN 'Troca de folga solicitada: ' ELSE 'Nova solicitação: ' END || coalesce(v_nome,'colaborador');
   INSERT INTO public.dp_notificacoes(company_id,tipo,titulo,descricao,ref_table,ref_id,para_admins)
   VALUES(NEW.company_id,'solicitacao_nova',v_titulo,v_descricao,'dp_solicitacoes',NEW.id,true);
 ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('aprovada','recusada') THEN
   INSERT INTO public.dp_notificacoes(company_id,user_id,colaborador_id,tipo,titulo,descricao,ref_table,ref_id)
   SELECT NEW.company_id,c.user_id,c.id,'solicitacao_respondida',CASE WHEN v_troca THEN 'Sua troca de folga foi ' ELSE 'Sua solicitação foi ' END || NEW.status::text,v_descricao,'dp_solicitacoes',NEW.id
   FROM public.dp_colaboradores c WHERE c.id=NEW.colaborador_id AND c.company_id=NEW.company_id AND c.user_id IS NOT NULL;
 END IF;
 RETURN NEW;
END $function$;