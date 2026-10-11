CREATE OR REPLACE FUNCTION public.dp_folga_admin_remarcar_limite(p_folga_id uuid, p_solicitacao_id uuid, p_colaborador uuid, p_data_atual date, p_data_nova date, p_consome_vaga boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  r := public.dp_folga_admin_remarcar(p_folga_id, p_solicitacao_id, p_colaborador, p_data_atual, p_data_nova);
  UPDATE public.dp_folgas SET extra = NOT coalesce(p_consome_vaga, true), updated_at = now()
   WHERE colaborador_id = p_colaborador AND data = p_data_nova AND status <> 'cancelada';
  IF NOT coalesce(p_consome_vaga, true) AND NOT FOUND THEN
    INSERT INTO public.dp_folgas(company_id, colaborador_id, data, origem, status, extra, observacao, criado_por)
    SELECT c.company_id, p_colaborador, p_data_nova, 'troca', 'agendada', true, 'Remarcada pelo gestor sem consumir vaga', auth.uid()
      FROM public.dp_colaboradores c WHERE c.id = p_colaborador;
  END IF;
  RETURN r || jsonb_build_object('consome_vaga', coalesce(p_consome_vaga, true));
END $$;

CREATE OR REPLACE FUNCTION public.dp_folga_admin_trocar_fixa_limite(p_colaborador uuid, p_data_fixa date, p_data_nova date, p_motivo text DEFAULT NULL, p_consome_vaga boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  r := public.dp_folga_admin_trocar_fixa(p_colaborador, p_data_fixa, p_data_nova, p_motivo);
  UPDATE public.dp_folgas SET extra = NOT coalesce(p_consome_vaga, true), updated_at = now()
   WHERE colaborador_id = p_colaborador AND data = p_data_nova AND status <> 'cancelada';
  RETURN r || jsonb_build_object('consome_vaga', coalesce(p_consome_vaga, true));
END $$;

-- Pedido aprovado deixa de ocupar vaga quando o gestor marcou a folga do dia como exceção.
CREATE OR REPLACE FUNCTION private.dp_folga_ocupa_vaga(_colab uuid, _data date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT (
    EXISTS (SELECT 1 FROM public.dp_folgas f
             WHERE f.colaborador_id = _colab AND f.data = _data
               AND f.status <> 'cancelada' AND f.extra = false
               AND f.tipo NOT IN ('ferias','licenca'))
    OR (EXISTS (SELECT 1 FROM public.dp_solicitacoes s
                WHERE s.colaborador_id = _colab AND s.tipo = 'folga'
                  AND s.data_alvo = _data AND s.status = 'aprovada')
        AND NOT EXISTS (SELECT 1 FROM public.dp_folgas f2
                WHERE f2.colaborador_id = _colab AND f2.data = _data
                  AND f2.status <> 'cancelada' AND f2.extra = true))
  )
  AND NOT (EXTRACT(DOW FROM _data)::int = 0
           AND 0::smallint = ANY (COALESCE(public.dp_dias_fixos_folga(_colab, _data), '{}'::smallint[])));
$function$;

REVOKE ALL ON FUNCTION public.dp_folga_admin_remarcar_limite(uuid,uuid,uuid,date,date,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_folga_admin_trocar_fixa_limite(uuid,date,date,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_remarcar_limite(uuid,uuid,uuid,date,date,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_admin_trocar_fixa_limite(uuid,date,date,text,boolean) TO authenticated, service_role;