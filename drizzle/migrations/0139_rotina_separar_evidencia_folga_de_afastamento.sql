CREATE OR REPLACE FUNCTION public.dp_rotina_ausencia_operacional_em(p_colaborador uuid, p_data date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.dp_ocorrencias o WHERE o.colaborador_id=p_colaborador AND o.data_operacional=p_data AND o.estado='confirmada' AND o.cancelado_em IS NULL AND o.folga_id IS NULL AND o.troca_id IS NULL AND o.tipo::text IN ('falta','atestado','ausencia_justificada'));
$$;
REVOKE ALL ON FUNCTION public.dp_rotina_ausencia_operacional_em(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_rotina_ausencia_operacional_em(uuid,date) TO service_role;