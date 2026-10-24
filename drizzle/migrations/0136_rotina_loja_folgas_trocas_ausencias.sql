CREATE OR REPLACE FUNCTION public.dp_rotina_folga_em(p_colaborador uuid, p_data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
 SELECT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id=p_colaborador AND f.data=p_data AND coalesce(f.status::text,'') <> 'cancelada')
 OR EXISTS (SELECT 1 FROM public.dp_solicitacoes s WHERE s.colaborador_id=p_colaborador AND s.tipo='folga' AND s.status='aprovada' AND s.removido_em IS NULL AND s.data_alvo=p_data);
$$;
CREATE OR REPLACE FUNCTION public.dp_rotina_ausencia_operacional_em(p_colaborador uuid, p_data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
 SELECT EXISTS (SELECT 1 FROM public.dp_ocorrencias o WHERE o.colaborador_id=p_colaborador AND o.data_operacional=p_data AND o.estado='confirmada' AND o.cancelado_em IS NULL AND o.tipo::text IN ('falta','atestado','ausencia_justificada'));
$$;
ALTER FUNCTION public.dp_rotina_folga_em(uuid,date) OWNER TO postgres;
ALTER FUNCTION public.dp_rotina_ausencia_operacional_em(uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dp_rotina_folga_em(uuid,date), public.dp_rotina_ausencia_operacional_em(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_rotina_folga_em(uuid,date), public.dp_rotina_ausencia_operacional_em(uuid,date) TO service_role;
DO $patch$
DECLARE original text; updated text; target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['dp_portal_rotina_dia','dp_portal_equipe_fora_dia','dp_portal_minha_situacao_dia'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO original FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=target AND p.pronargs=1;
  IF original IS NULL THEN RAISE EXCEPTION 'Funcao ausente: %',target; END IF;
  updated := replace(original, 'private.dp_colab_falta_confirmada_em', 'public.dp_rotina_ausencia_operacional_em');
  IF target='dp_portal_rotina_dia' THEN
   updated := replace(updated, 'NOT EXISTS (SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = c.id AND f.data = p_data AND coalesce(f.status::text,'''') <> ''cancelada'')', 'NOT public.dp_rotina_folga_em(c.id, p_data)');
   updated := replace(updated, 'AND coalesce(d.trabalha, false) = true', 'AND (coalesce(d.trabalha, false) = true OR EXISTS (SELECT 1 FROM public.dp_dia_trabalho_excepcional ex WHERE ex.colaborador_id=c.id AND ex.company_id=v_company AND ex.data=p_data))');
   updated := replace(updated, 'c.regime NOT IN (''intermitente''::dp_regime_trabalho, ''freelancer''::dp_regime_trabalho)', '(c.regime <> ''intermitente''::dp_regime_trabalho AND (c.regime <> ''freelancer''::dp_regime_trabalho OR c.forma_pagamento::text = ''mensalista''))');
   updated := replace(updated, 'AND c.company_id = v_company AND c.ativo IS NOT FALSE', 'AND c.company_id = v_company AND c.ativo IS NOT FALSE AND (c.data_admissao IS NULL OR c.data_admissao <= p_data)');
   updated := replace(updated, 'WHERE c.company_id = v_company AND c.unidade_id = v_unidade AND c.ativo IS NOT FALSE', 'WHERE c.company_id = v_company AND c.unidade_id = v_unidade AND c.ativo IS NOT FALSE AND (c.data_admissao IS NULL OR c.data_admissao <= p_data)');
  ELSIF target='dp_portal_equipe_fora_dia' THEN
   updated := regexp_replace(updated, 'EXISTS \(SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id = c.id AND f.data = p_data\s+AND coalesce\(f.status::text,''''\) <> ''cancelada''\)', 'public.dp_rotina_folga_em(c.id, p_data)');
   updated := replace(updated, 'WHERE c.company_id = v_company AND c.unidade_id = v_unidade AND c.ativo IS NOT FALSE', 'WHERE c.company_id = v_company AND c.unidade_id = v_unidade AND c.ativo IS NOT FALSE AND (c.data_admissao IS NULL OR c.data_admissao <= p_data)');
  ELSE
   updated := replace(updated, 'ELSE NULL END', 'WHEN public.dp_rotina_folga_em(me.id, p_data) THEN ''folga'' ELSE NULL END');
  END IF;
  IF updated=original OR (target IN ('dp_portal_rotina_dia','dp_portal_equipe_fora_dia') AND position('public.dp_rotina_folga_em(c.id, p_data)' in updated)=0) THEN RAISE EXCEPTION 'Definicao inesperada: %',target; END IF;
  EXECUTE updated;
 END LOOP;
END;
$patch$;
REVOKE ALL ON FUNCTION public.dp_portal_rotina_dia(date), public.dp_portal_equipe_fora_dia(date), public.dp_portal_minha_situacao_dia(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_rotina_dia(date), public.dp_portal_equipe_fora_dia(date), public.dp_portal_minha_situacao_dia(date) TO authenticated, service_role;