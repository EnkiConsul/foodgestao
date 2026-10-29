ALTER TABLE public.dp_trocas ADD COLUMN IF NOT EXISTS gestor_requisicao uuid;
CREATE UNIQUE INDEX IF NOT EXISTS dp_trocas_gestor_requisicao_uidx ON public.dp_trocas(company_id,gestor_requisicao) WHERE gestor_requisicao IS NOT NULL;
ALTER TABLE public.dp_documentos ADD COLUMN IF NOT EXISTS troca_gestor_id uuid REFERENCES public.dp_trocas(id);
CREATE UNIQUE INDEX IF NOT EXISTS dp_documentos_troca_gestor_pessoa_uidx ON public.dp_documentos(troca_gestor_id,colaborador_id) WHERE troca_gestor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.dp_troca_gestor_participantes(_company uuid,_sol uuid,_dest uuid,_original date,_proposta date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('colaborador_id',c.id,'nome',c.nome,'formal',coalesce(c.origem_cadastro,'')<>'preadmissao_rotina' AND coalesce(c.regime::text,'') IN ('clt','intermitente','estagio','temporario'),'portal',c.user_id IS NOT NULL,'data_original',CASE WHEN c.id=_sol THEN _original ELSE _proposta END,'data_nova',CASE WHEN c.id=_sol THEN _proposta ELSE _original END,'empresa',e.name) ORDER BY c.id),'[]'::jsonb)
 FROM public.dp_colaboradores c JOIN public.companies e ON e.id=c.company_id WHERE c.company_id=_company AND c.id IN (_sol,_dest);
$$;
REVOKE ALL ON FUNCTION private.dp_troca_gestor_participantes(uuid,uuid,uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_troca_gestor_participantes(uuid,uuid,uuid,date,date) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_troca_gestor_previa(_company uuid,_sol uuid,_dest uuid,_original date,_proposta date)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT private.dp_troca_gestor_validar(_company,_sol,_dest,_original,_proposta) || jsonb_build_object('participantes',private.dp_troca_gestor_participantes(_company,_sol,_dest,_original,_proposta));
$$;
REVOKE ALL ON FUNCTION public.dp_troca_gestor_previa(uuid,uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_troca_gestor_previa(uuid,uuid,uuid,date,date) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.dp_troca_gestor_registrar_documentada(_company uuid,_sol uuid,_dest uuid,_original date,_proposta date,_motivo text,_ciente_dsr boolean,_requisicao uuid,_arquivos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v jsonb; p jsonb; a jsonb; tid uuid; did uuid; cid uuid; participantes jsonb; qtd integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (private.is_company_admin_or_owner(auth.uid(),_company) OR public.is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF _requisicao IS NULL OR jsonb_typeof(_arquivos) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || _requisicao::text,0));
 SELECT id INTO tid FROM public.dp_trocas WHERE company_id=_company AND gestor_requisicao=_requisicao AND gestor_id=auth.uid();
 IF tid IS NOT NULL THEN RETURN jsonb_build_object('troca_id',tid,'status','aprovada','repetida',true); END IF;
 FOR cid IN SELECT x FROM unnest(ARRAY[_sol,_dest]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(cid::text || '|troca_gestor',0));
  PERFORM 1 FROM public.dp_colaboradores WHERE id=cid AND company_id=_company FOR UPDATE;
 END LOOP;
 v:=public.dp_troca_gestor_registrar(_company,_sol,_dest,_original,_proposta,_motivo,_ciente_dsr,false);
 tid:=(v->>'troca_id')::uuid;
 participantes:=private.dp_troca_gestor_participantes(_company,_sol,_dest,_original,_proposta);
 SELECT count(*) INTO qtd FROM jsonb_array_elements(participantes) x WHERE (x->>'formal')::boolean;
 IF jsonb_array_length(_arquivos)<>qtd THEN RAISE EXCEPTION 'TROCA_TERMOS_DIVERGENTES'; END IF;
 FOR p IN SELECT x FROM jsonb_array_elements(participantes) x WHERE (x->>'formal')::boolean LOOP
  SELECT x INTO a FROM jsonb_array_elements(_arquivos) x WHERE x->>'colaborador_id'=p->>'colaborador_id';
  IF a IS NULL OR a->>'file_path' IS DISTINCT FROM format('%s/%s/trocas/%s/termo-alteracao-folga-%s.pdf',_company,p->>'colaborador_id',_requisicao,p->>'data_original') THEN RAISE EXCEPTION 'TROCA_TERMOS_DIVERGENTES'; END IF;
  did:=public.dp_documento_registrar(jsonb_build_object('company_id',_company,'colaborador_id',p->>'colaborador_id','tipo','ajuste_jornada','titulo','Termo de Alteração de Folga','descricao','Alteração pontual autorizada pelo gestor; assinatura individual pendente.','file_path',a->>'file_path','file_name',format('termo-alteracao-folga-%s.pdf',p->>'data_original'),'file_size',a->>'file_size','mime_type','application/pdf','referencia_data',p->>'data_original','exige_aceite',true));
  UPDATE public.dp_documentos SET troca_gestor_id=tid WHERE id=did;
 END LOOP;
 UPDATE public.dp_trocas SET gestor_requisicao=_requisicao WHERE id=tid;
 RETURN v || jsonb_build_object('termos',qtd);
END $$;
REVOKE ALL ON FUNCTION public.dp_troca_gestor_registrar_documentada(uuid,uuid,uuid,date,date,text,boolean,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dp_troca_gestor_registrar_documentada(uuid,uuid,uuid,date,date,text,boolean,uuid,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.dp_troca_gestor_cancelar_documentos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status::text='cancelada' AND OLD.status IS DISTINCT FROM NEW.status THEN
  UPDATE public.dp_documentos SET arquivado_em=now(),arquivado_por=auth.uid(),arquivamento_motivo='Troca cancelada; documento e aceites preservados.' WHERE troca_gestor_id=NEW.id AND arquivado_em IS NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_troca_gestor_cancelar_documentos() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_troca_gestor_cancelar_documentos() TO service_role;
CREATE TRIGGER trg_dp_troca_gestor_cancelar_documentos AFTER UPDATE OF status ON public.dp_trocas FOR EACH ROW EXECUTE FUNCTION private.dp_troca_gestor_cancelar_documentos();