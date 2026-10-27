-- Alinha o arquivo de migração à definição já aplicada no banco: trocas retroativas
-- do gestor até 31 dias, com confirmação na interface, e sinalização `retroativa`.
CREATE OR REPLACE FUNCTION private.dp_troca_gestor_validar(_company uuid, _sol uuid, _dest uuid, _original date, _proposta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a public.dp_colaboradores%ROWTYPE; b public.dp_colaboradores%ROWTYPE; p record; d date;
 hoje date; seq integer; maior integer; riscos jsonb:='[]'::jsonb; descanso boolean; cfg jsonb; trabalha boolean; passa_cedida boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT (private.is_company_admin_or_owner(auth.uid(),_company) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF _sol IS NULL OR _dest IS NULL OR _sol=_dest OR _original IS NULL OR _proposta IS NULL OR _original=_proposta OR abs(_original-_proposta)>62 THEN RAISE EXCEPTION 'INVALID_INPUT: duas pessoas e datas diferentes, até 62 dias entre elas'; END IF;
 SELECT (now() AT TIME ZONE coalesce(nullif(c.timezone,''),'America/Sao_Paulo'))::date INTO hoje FROM public.companies c WHERE c.id=_company;
 -- Managers may register retroactive swaps up to 31 days back after explicit UI confirmation; older history stays locked.
 IF hoje IS NULL OR least(_original,_proposta)<hoje-31 THEN RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE'; END IF;
 SELECT * INTO a FROM public.dp_colaboradores WHERE id=_sol AND company_id=_company AND ativo AND deleted_at IS NULL;
 SELECT * INTO b FROM public.dp_colaboradores WHERE id=_dest AND company_id=_company AND ativo AND deleted_at IS NULL;
 IF NOT public.unidade_liberada(_company,a.unidade_id) THEN RAISE EXCEPTION 'FORBIDDEN_UNIDADE'; END IF;
 IF a.id IS NULL OR b.id IS NULL OR a.unidade_id IS NULL OR a.unidade_id IS DISTINCT FROM b.unidade_id THEN RAISE EXCEPTION 'FORBIDDEN: pessoas ativas da mesma unidade'; END IF;
 SELECT to_jsonb(c) INTO cfg FROM public.dp_config_resolvida(_company,a.unidade_id)c;
 IF cfg->>'troca_folga_modo'='proibida' THEN RAISE EXCEPTION 'TROCA_PROIBIDA: trocas desativadas nesta unidade'; END IF;
 IF EXISTS (SELECT 1 FROM public.dp_trocas t WHERE t.company_id=_company AND t.status IN ('pendente_colega','pendente_gestor','aprovada') AND (t.solicitante_id IN (_sol,_dest) OR t.destino_id IN (_sol,_dest)) AND (t.data_original IN (_original,_proposta) OR t.data_proposta IN (_original,_proposta))) THEN RAISE EXCEPTION 'DUPLICATE_REQUEST'; END IF;
 FOR p IN SELECT a.id cid,a.nome nome,_original cedida,_proposta nova UNION ALL SELECT b.id,b.nome,_proposta,_original LOOP
  IF EXISTS (SELECT 1 FROM public.dp_desligamento_processos x WHERE x.company_id=_company AND x.colaborador_id=p.cid AND x.status='aviso_em_curso' AND x.ultimo_comparecimento<greatest(_original,_proposta)) THEN RAISE EXCEPTION 'TROCA_FORA_ROTINA: data posterior ao último comparecimento'; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id=p.cid AND ((c.data_desligamento IS NOT NULL AND c.data_desligamento<greatest(_original,_proposta)) OR (c.data_admissao IS NOT NULL AND c.data_admissao>least(_original,_proposta) AND coalesce(c.origem_cadastro,'')<>'preadmissao_rotina'))) THEN RAISE EXCEPTION 'TROCA_FORA_ROTINA'; END IF;
  IF private.dp_colab_afastado_em(p.cid,_original) OR private.dp_colab_afastado_em(p.cid,_proposta) OR public.dp_rotina_ausencia_operacional_em(p.cid,_original) OR public.dp_rotina_ausencia_operacional_em(p.cid,_proposta) THEN RAISE EXCEPTION 'TROCA_FOLGA_EM_AFASTAMENTO'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id=p.cid AND f.data=p.cedida AND f.status<>'cancelada') AND NOT private.dp_troca_folga_fixa_livre(p.cid,p.cedida) THEN RAISE EXCEPTION 'TROCA_SEM_FOLGA_PROPRIA: % não tem folga na data oferecida',p.nome; END IF;
  IF EXISTS(SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id=p.cid AND f.data=p.nova AND f.status<>'cancelada') OR private.dp_troca_folga_fixa_livre(p.cid,p.nova) THEN RAISE EXCEPTION 'TROCA_JA_TEM_FOLGA: % já tem descanso na data recebida',p.nome; END IF;
  IF private.dp_regra_bloqueia_colaborador(p.cid,p.nova) IS NOT NULL THEN RAISE EXCEPTION 'TROCA_DATA_BLOQUEADA'; END IF;
  seq:=0; maior:=0; passa_cedida:=false;
  FOR d IN SELECT generate_series(least(_original,_proposta)-21,greatest(_original,_proposta)+21,interval '1 day')::date LOOP
   SELECT i.tipo='trabalho' INTO trabalha FROM public.dp_escala_itens i JOIN public.dp_escalas e ON e.id=i.escala_id WHERE i.colaborador_id=p.cid AND i.data=d AND e.status='publicada' ORDER BY i.updated_at DESC LIMIT 1;
   descanso := (d NOT IN (p.cedida,p.nova) AND trabalha IS false) OR d=p.nova OR (d<>p.cedida AND (private.dp_troca_folga_fixa_livre(p.cid,d) OR EXISTS(SELECT 1 FROM public.dp_folgas f WHERE f.colaborador_id=p.cid AND f.data=d AND f.status<>'cancelada') OR private.dp_colab_afastado_em(p.cid,d) OR public.dp_rotina_ausencia_operacional_em(p.cid,d)));
   IF EXISTS(SELECT 1 FROM public.dp_colaboradores c WHERE c.id=p.cid AND coalesce(c.origem_cadastro,'')<>'preadmissao_rotina' AND c.data_admissao>d) THEN descanso:=true; END IF;
   IF descanso THEN seq:=0; passa_cedida:=false; ELSE seq:=seq+1; passa_cedida:=passa_cedida OR d=p.cedida; END IF;
   IF passa_cedida THEN maior:=greatest(maior,seq); END IF;
  END LOOP;
  IF maior>=7 THEN riscos:=riscos || jsonb_build_array(jsonb_build_object('colaborador_id',p.cid,'nome',p.nome,'dias',maior)); END IF;
 END LOOP;
 RETURN jsonb_build_object('retroativa',least(_original,_proposta)<hoje,'riscos',riscos,'em_admissao',coalesce(a.origem_cadastro,'')='preadmissao_rotina' OR coalesce(b.origem_cadastro,'')='preadmissao_rotina');
END $function$;