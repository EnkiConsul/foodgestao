ALTER TABLE public.concierge_provisionamentos ADD COLUMN IF NOT EXISTS entrega_resumo jsonb;
CREATE OR REPLACE FUNCTION public.concierge_prazo(p_fim timestamptz, p_modo text, p_agora timestamptz) RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$ SELECT CASE p_modo WHEN 'manter' THEN p_fim WHEN 'reiniciar_7d' THEN p_agora + interval '7 days' WHEN 'somar_7d' THEN greatest(p_fim,p_agora) + interval '7 days' END $$;
REVOKE ALL ON FUNCTION public.concierge_prazo(timestamptz,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_prazo(timestamptz,text,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_concierge_previa_entrega(p_company_id uuid,p_modo_trial text DEFAULT 'manter') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_m text; v_fim timestamptz; v_prazos jsonb := '[]';
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_modo_trial IS NULL OR p_modo_trial NOT IN ('manter','reiniciar_7d','somar_7d') THEN RAISE EXCEPTION 'modo_trial_invalido'; END IF;
 SELECT * INTO v_p FROM public.concierge_provisionamentos WHERE company_id=p_company_id AND modo='apoio';
 IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado'; END IF;
 IF v_p.parametrizacao_concluida_em IS NOT NULL AND v_p.entrega_resumo IS NOT NULL THEN RETURN v_p.entrega_resumo; END IF;
 FOREACH v_m IN ARRAY v_p.modulos LOOP
   SELECT max(x.fim) INTO v_fim FROM (
    SELECT coalesce(cm.trial_termina_em,cm.ends_at) fim FROM public.company_modules cm WHERE cm.company_id=p_company_id AND cm.module::text=v_m AND cm.status='trial'
    UNION ALL SELECT coalesce(s.trial_ends_at,s.current_period_end) FROM public.subscriptions s JOIN public.subscription_companies sc ON sc.subscription_id=s.id AND sc.removed_at IS NULL WHERE sc.company_id=p_company_id AND s.status='trialing' AND s.module=CASE WHEN v_m='dp' THEN 'pessoas' ELSE v_m END
   ) x;
   IF v_fim IS NULL AND EXISTS (SELECT 1 FROM public.company_modules cm WHERE cm.company_id=p_company_id AND cm.module::text=v_m AND cm.status='trial') THEN
     SELECT trial_termina_em INTO v_fim FROM public.companies WHERE id=p_company_id AND status_tenant='trial';
   END IF;
   v_prazos := v_prazos || jsonb_build_array(jsonb_build_object('modulo',v_m,'fim_atual',v_fim,'fim',CASE WHEN v_fim IS NOT NULL THEN public.concierge_prazo(v_fim,p_modo_trial,now()) ELSE NULL END));
 END LOOP;
 RETURN jsonb_build_object('modo_trial',p_modo_trial,'prazos',v_prazos,'unidades',(SELECT count(*) FROM public.dp_unidades WHERE company_id=p_company_id),'fichas',(SELECT count(*) FROM public.dp_ficha_importacoes WHERE company_id=p_company_id));
END $$;
REVOKE ALL ON FUNCTION public.admin_concierge_previa_entrega(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_previa_entrega(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_concierge_concluir_parametrizacao(p_company_id uuid,p_modo_trial text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_dono uuid; v_res jsonb; v_item jsonb; v_fim timestamptz; v_m text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
 IF p_modo_trial IS NULL OR p_modo_trial NOT IN ('manter','reiniciar_7d','somar_7d') THEN RAISE EXCEPTION 'modo_trial_invalido'; END IF;
 SELECT * INTO v_p FROM public.concierge_provisionamentos WHERE company_id=p_company_id AND modo='apoio' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado'; END IF;
 IF v_p.parametrizacao_concluida_em IS NOT NULL THEN RETURN coalesce(v_p.entrega_resumo,public.admin_concierge_previa_entrega(p_company_id,'manter')); END IF;
 SELECT user_id INTO v_dono FROM public.companies WHERE id=p_company_id FOR UPDATE;
 PERFORM s.id FROM public.subscriptions s JOIN public.subscription_companies sc ON sc.subscription_id=s.id WHERE sc.company_id=p_company_id AND sc.removed_at IS NULL AND s.status='trialing' FOR UPDATE OF s;
 PERFORM id FROM public.company_modules WHERE company_id=p_company_id FOR UPDATE;
 IF p_modo_trial<>'manter' AND EXISTS (
 SELECT 1 FROM public.subscriptions s JOIN public.subscription_companies sc ON sc.subscription_id=s.id WHERE sc.company_id=p_company_id AND sc.removed_at IS NULL AND s.status='trialing' AND EXISTS (SELECT 1 FROM public.subscription_companies other WHERE other.subscription_id=s.id AND other.removed_at IS NULL AND other.company_id<>p_company_id)
 ) THEN RAISE EXCEPTION 'trial_compartilhado'; END IF;
 v_res := public.admin_concierge_previa_entrega(p_company_id,p_modo_trial);
 IF p_modo_trial<>'manter' THEN
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_res->'prazos') LOOP
  v_m := v_item->>'modulo'; v_fim := (v_item->>'fim')::timestamptz;
  IF v_fim IS NULL THEN CONTINUE; END IF;
  UPDATE public.company_modules SET ends_at=v_fim,trial_termina_em=v_fim WHERE company_id=p_company_id AND module::text=v_m AND status='trial';
  UPDATE public.subscriptions s SET trial_ends_at=v_fim,current_period_end=v_fim WHERE s.status='trialing' AND s.module=CASE WHEN v_m='dp' THEN 'pessoas' ELSE v_m END AND EXISTS (SELECT 1 FROM public.subscription_companies sc WHERE sc.subscription_id=s.id AND sc.company_id=p_company_id AND sc.removed_at IS NULL);
  UPDATE public.trial_usage t SET ends_at=v_fim WHERE t.subscription_id IN (SELECT s.id FROM public.subscriptions s JOIN public.subscription_companies sc ON sc.subscription_id=s.id WHERE sc.company_id=p_company_id AND sc.removed_at IS NULL AND s.status='trialing' AND s.module=CASE WHEN v_m='dp' THEN 'pessoas' ELSE v_m END);
 END LOOP;
 SELECT max((value->>'fim')::timestamptz) INTO v_fim FROM jsonb_array_elements(v_res->'prazos');
 IF v_fim IS NOT NULL THEN UPDATE public.companies SET trial_termina_em=v_fim WHERE id=p_company_id AND status_tenant='trial'; END IF;
 END IF;
 DELETE FROM public.company_members WHERE company_id=p_company_id AND user_id=v_p.criado_por AND user_id<>v_dono;
 UPDATE public.concierge_provisionamentos SET parametrizacao_concluida_em=now(),entrega_resumo=v_res WHERE company_id=p_company_id;
 RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.admin_concierge_concluir_parametrizacao(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_concluir_parametrizacao(uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_concierge_concluir_parametrizacao(p_company_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT public.admin_concierge_concluir_parametrizacao(p_company_id,'manter') $$;
REVOKE ALL ON FUNCTION public.admin_concierge_concluir_parametrizacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_concluir_parametrizacao(uuid) TO authenticated,service_role;