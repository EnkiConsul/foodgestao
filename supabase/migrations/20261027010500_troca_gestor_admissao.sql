ALTER TABLE public.dp_trocas ADD COLUMN IF NOT EXISTS origem_registro text NOT NULL DEFAULT 'portal';
ALTER TABLE public.dp_trocas ADD COLUMN IF NOT EXISTS notificar_portal boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.dp_trocas_exige_assinatura_solicitante()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.origem_registro IS DISTINCT FROM OLD.origem_registro OR NEW.notificar_portal IS DISTINCT FROM OLD.notificar_portal) THEN
  RAISE EXCEPTION 'FORBIDDEN: origem da troca imutável';
 END IF;
 IF NEW.origem_registro='gestor' THEN
  IF NOT (private.is_company_admin_or_owner(auth.uid(),NEW.company_id) OR public.is_super_admin(auth.uid()))
     OR NEW.gestor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN: autorização do gestor obrigatória'; END IF;
  IF TG_OP='INSERT' AND NEW.status::text<>'pendente_gestor' THEN RAISE EXCEPTION 'INVALID_INPUT: efetivação administrativa deve usar rotina oficial'; END IF;
  IF NEW.solicitante_assinatura IS NOT NULL OR NEW.destino_assinatura IS NOT NULL OR NEW.colega_resposta IS NOT NULL THEN
   RAISE EXCEPTION 'INVALID_INPUT: ajuste administrativo não representa aceite ou assinatura';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.created_at >= '2026-10-04 22:30:00+00' AND NEW.solicitante_assinatura IS NULL
    AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text NOT IN ('cancelada','expirada','recusada','pendente_colega') THEN
  RAISE EXCEPTION 'troca_sem_assinatura_solicitante';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trg_dp_trocas_exige_assinatura ON public.dp_trocas;
CREATE TRIGGER trg_dp_trocas_exige_assinatura BEFORE INSERT OR UPDATE ON public.dp_trocas FOR EACH ROW EXECUTE FUNCTION public.dp_trocas_exige_assinatura_solicitante();

-- Read-only validation is shared by preview and commit. Never trust client DSR counts.
CREATE OR REPLACE FUNCTION private.dp_troca_gestor_validar(_company uuid,_sol uuid,_dest uuid,_original date,_proposta date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.dp_colaboradores%ROWTYPE; b public.dp_colaboradores%ROWTYPE; p record; d date;
 hoje date; seq integer; maior integer; riscos jsonb:='[]'::jsonb; descanso boolean; cfg jsonb; trabalha boolean; passa_cedida boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT (private.is_company_admin_or_owner(auth.uid(),_company) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF _sol IS NULL OR _dest IS NULL OR _sol=_dest OR _original IS NULL OR _proposta IS NULL OR _original=_proposta OR abs(_original-_proposta)>62 THEN RAISE EXCEPTION 'INVALID_INPUT: duas pessoas e datas diferentes, até 62 dias entre elas'; END IF;
 SELECT (now() AT TIME ZONE coalesce(nullif(c.timezone,''),'America/Sao_Paulo'))::date INTO hoje FROM public.companies c WHERE c.id=_company;
 IF hoje IS NULL OR least(_original,_proposta)<hoje THEN RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE'; END IF;
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
 RETURN jsonb_build_object('riscos',riscos,'em_admissao',coalesce(a.origem_cadastro,'')='preadmissao_rotina' OR coalesce(b.origem_cadastro,'')='preadmissao_rotina');
END $$;
REVOKE ALL ON FUNCTION private.dp_troca_gestor_validar(uuid,uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_troca_gestor_validar(uuid,uuid,uuid,date,date) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_troca_gestor_previa(_company uuid,_sol uuid,_dest uuid,_original date,_proposta date)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT private.dp_troca_gestor_validar(_company,_sol,_dest,_original,_proposta) $$;
REVOKE ALL ON FUNCTION public.dp_troca_gestor_previa(uuid,uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_troca_gestor_previa(uuid,uuid,uuid,date,date) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.dp_troca_gestor_registrar(_company uuid,_sol uuid,_dest uuid,_original date,_proposta date,_motivo text,_ciente_dsr boolean DEFAULT false,_notificar boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v jsonb; tid uuid; risco jsonb; cid uuid;
BEGIN
 IF length(btrim(coalesce(_motivo,'')))<3 THEN RAISE EXCEPTION 'INVALID_INPUT: motivo obrigatório'; END IF;
 -- Serialize both people in canonical order; overlapping/reversed swaps cannot consume the same leave.
 FOR cid IN SELECT x FROM unnest(ARRAY[_sol,_dest]) x ORDER BY x LOOP PERFORM pg_advisory_xact_lock(hashtextextended(cid::text || '|troca_gestor',0)); END LOOP;
 v:=private.dp_troca_gestor_validar(_company,_sol,_dest,_original,_proposta);
 IF jsonb_array_length(v->'riscos')>0 AND NOT coalesce(_ciente_dsr,false) THEN RAISE EXCEPTION 'DSR_CIENCIA_OBRIGATORIA'; END IF;
 INSERT INTO public.dp_trocas(company_id,solicitante_id,destino_id,data_original,data_proposta,motivo,status,created_by,gestor_id,origem_registro,notificar_portal)
 VALUES(_company,_sol,_dest,_original,_proposta,btrim(_motivo),'pendente_gestor',auth.uid(),auth.uid(),'gestor',coalesce(_notificar,false)) RETURNING id INTO tid;
 PERFORM private.dp_troca_efetivar(tid,auth.uid());
 UPDATE public.dp_trocas SET status='aprovada',gestor_resposta='aprovada: Ajuste operacional autorizado pelo gestor. ' || btrim(_motivo),gestor_respondido_em=now() WHERE id=tid;
 -- Existing linked evidence is retained; authorization is not an external point posting.
 UPDATE public.dp_ocorrencias o SET tratativa_ponto=false,tratativa_status='nao_se_aplica',tratativa_decisao=NULL,analisado_por=auth.uid(),
 justificativa_inicial=format('%s por troca autorizada pelo gestor com %s. Datas: %s e %s. Motivo: %s.%s',CASE WHEN o.subtipo='troca_trabalho' THEN 'Trabalho previsto' ELSE 'Folga' END,c.nome,to_char(_original,'DD/MM/YYYY'),to_char(_proposta,'DD/MM/YYYY'),btrim(_motivo),CASE WHEN me.origem_cadastro='preadmissao_rotina' THEN ' Registro operacional durante processo de admissão; sem aceite contratual.' ELSE ' Justificativa para conferência no sistema externo, sem apuração de ponto pelo AVETO 360.' END)
 FROM public.dp_colaboradores me,public.dp_colaboradores c WHERE o.troca_id=tid AND o.estado<>'cancelada' AND me.id=o.colaborador_id AND c.id=CASE WHEN o.colaborador_id=_sol THEN _dest ELSE _sol END;
 FOR risco IN SELECT * FROM jsonb_array_elements(v->'riscos') LOOP
  INSERT INTO public.dp_dsr_ciencias(company_id,colaborador_id,user_id,papel,referencia_tabela,referencia_id,data_referencia,dias_seguidos)
  VALUES(_company,(risco->>'colaborador_id')::uuid,auth.uid(),'gestor','dp_trocas',tid,_original,(risco->>'dias')::integer);
 END LOOP;
 RETURN jsonb_build_object('troca_id',tid,'status','aprovada');
END $$;
REVOKE ALL ON FUNCTION public.dp_troca_gestor_registrar(uuid,uuid,uuid,date,date,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_troca_gestor_registrar(uuid,uuid,uuid,date,date,text,boolean,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.dp_notif_troca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_solic uuid;
  v_dest uuid;
  v_titulo text;
BEGIN
  IF NEW.origem_registro='gestor' THEN
    IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('aprovada','cancelada') AND (NEW.notificar_portal OR NEW.status::text='cancelada') THEN
      INSERT INTO public.dp_notificacoes(company_id,user_id,colaborador_id,tipo,titulo,descricao,ref_table,ref_id)
      SELECT NEW.company_id,c.user_id,c.id,'troca_resposta_gestor',CASE WHEN NEW.status::text='cancelada' THEN 'Troca cancelada pelo gestor' ELSE 'Troca registrada pelo gestor' END,NEW.gestor_resposta,'dp_trocas',NEW.id
      FROM public.dp_colaboradores c WHERE c.id IN (NEW.solicitante_id,NEW.destino_id) AND c.user_id IS NOT NULL AND coalesce(c.origem_cadastro,'')<>'preadmissao_rotina';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.dp_notificacoes (company_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
    VALUES (NEW.company_id, 'troca_nova', 'Nova solicitação de troca',
            'Data original: ' || NEW.data_original::text,
            'dp_trocas', NEW.id, true);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.colega_resposta IS DISTINCT FROM OLD.colega_resposta AND NEW.colega_resposta IS NOT NULL THEN
      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_colega',
                'Colega respondeu à sua troca', 'dp_trocas', NEW.id);
      END IF;
    END IF;

    IF NEW.gestor_resposta IS DISTINCT FROM OLD.gestor_resposta AND NEW.gestor_resposta IS NOT NULL THEN
      v_titulo := CASE
        WHEN NEW.status = 'expirada' THEN 'Solicitação de troca expirada'
        WHEN NEW.status = 'cancelada' THEN 'Gestor cancelou a troca'
        WHEN NEW.status = 'recusada' THEN 'Gestor recusou a troca'
        ELSE 'Gestor respondeu à troca'
      END;

      SELECT c.user_id INTO v_solic FROM public.dp_colaboradores c WHERE c.id = NEW.solicitante_id;
      SELECT c.user_id INTO v_dest FROM public.dp_colaboradores c WHERE c.id = NEW.destino_id;

      IF v_solic IS NOT NULL THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_solic, NEW.solicitante_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;

      IF v_dest IS NOT NULL AND v_dest IS DISTINCT FROM v_solic THEN
        INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id)
        VALUES (NEW.company_id, v_dest, NEW.destino_id, 'troca_resposta_gestor',
                v_titulo, NEW.gestor_resposta, 'dp_trocas', NEW.id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
