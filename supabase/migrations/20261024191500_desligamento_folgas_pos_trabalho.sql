-- Folgas agendadas depois do último dia de trabalho do desligamento são desmarcadas (sem trabalho, sem folga devida).
CREATE OR REPLACE FUNCTION public.dp_desligamento_folgas_pos_trabalho(p_id uuid, p_ator uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v public.dp_desligamento_processos%ROWTYPE; f public.dp_folgas%ROWTYPE; corte date;
BEGIN
 SELECT * INTO v FROM public.dp_desligamento_processos WHERE id=p_id;
 IF NOT FOUND OR v.status <> 'aviso_em_curso' THEN RETURN; END IF;
 corte := COALESCE(v.ultimo_comparecimento, v.dispensado_desde - 1);
 IF corte IS NULL THEN RETURN; END IF;
 FOR f IN SELECT * FROM public.dp_folgas WHERE colaborador_id=v.colaborador_id AND company_id=v.company_id AND status='agendada' AND data>corte AND desligamento_processo_id IS DISTINCT FROM v.id FOR UPDATE LOOP
   UPDATE public.dp_folgas SET status='cancelada',updated_at=now() WHERE id=f.id;
   INSERT INTO public.dp_folgas_canceladas(company_id,colaborador_id,folga_id,data,motivo,origem_cancelamento,cancelado_por)
     VALUES(f.company_id,f.colaborador_id,f.id,f.data,'Sem trabalho após o último dia do desligamento','desligamento',p_ator);
 END LOOP;
END $f$;
REVOKE ALL ON FUNCTION public.dp_desligamento_folgas_pos_trabalho(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_folgas_pos_trabalho(uuid,uuid) TO service_role;
