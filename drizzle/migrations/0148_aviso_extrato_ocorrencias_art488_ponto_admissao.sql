ALTER TABLE public.dp_ocorrencias ADD COLUMN desligamento_processo_id uuid REFERENCES public.dp_desligamento_processos(id);
ALTER TABLE public.dp_desligamento_processos ADD COLUMN extrato_aviso jsonb;
DROP INDEX public.idx_dp_ocorrencias_dedup;
CREATE UNIQUE INDEX idx_dp_ocorrencias_dedup ON public.dp_ocorrencias(colaborador_id,data_operacional,tipo) WHERE estado<>'cancelada' AND marcacao_alvo IS NULL AND folga_id IS NULL AND troca_id IS NULL AND desligamento_processo_id IS NULL;
CREATE UNIQUE INDEX dp_ocorrencias_aviso_dia ON public.dp_ocorrencias(desligamento_processo_id,data_operacional) WHERE desligamento_processo_id IS NOT NULL AND estado<>'cancelada' AND folga_id IS NULL;
CREATE OR REPLACE FUNCTION private.dp_aviso_ocorrencias(p_id uuid,p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.dp_desligamento_processos%ROWTYPE; datas jsonb; d date;
BEGIN
 SELECT * INTO v FROM public.dp_desligamento_processos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Aviso não encontrado'; END IF;
 IF NOT (p ? 'extrato_aviso') THEN RETURN; END IF;
 datas:=COALESCE(p->'extrato_aviso'->'dias_art488','[]'::jsonb);
 IF jsonb_typeof(datas)<>'array' OR jsonb_array_length(datas)>7 THEN RAISE EXCEPTION 'Dias de dispensa inválidos'; END IF;
 IF jsonb_array_length(datas)>0 AND (v.reducao IS DISTINCT FROM 'sete_dias' OR v.modalidade NOT IN ('trabalhado','misto') OR v.motivo::text <> 'dispensa_sem_justa_causa') THEN RAISE EXCEPTION 'Aviso sem dispensa legal de sete dias'; END IF;
 FOR d IN SELECT value::date FROM jsonb_array_elements_text(datas) LOOP
  IF d<v.inicio_aviso OR d>v.data_efetiva OR d NOT BETWEEN (p->'extrato_aviso'->'periodo_reducao'->>'inicio')::date AND (p->'extrato_aviso'->'periodo_reducao'->>'fim')::date THEN RAISE EXCEPTION 'Dispensa fora do período legal'; END IF;
 END LOOP;
 UPDATE public.dp_desligamento_processos SET extrato_aviso=p->'extrato_aviso' WHERE id=v.id;
 UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),cancelado_por=(p->>'ator')::uuid,motivo_cancelamento='Dispensa revista no processo de desligamento' WHERE desligamento_processo_id=v.id AND folga_id IS NULL AND estado<>'cancelada' AND NOT (datas ? data_operacional::text);
 FOR d IN SELECT DISTINCT value::date FROM jsonb_array_elements_text(datas) LOOP
  INSERT INTO public.dp_ocorrencias(company_id,colaborador_id,unidade_id,setor_id,data_operacional,tipo,estado,origem,justificativa_inicial,impacta_assiduidade,impacta_ferias,analise_status,analisado_em,analisado_por,relevancia_operacional,assiduidade_risco,tratativa_ponto,tratativa_status,subtipo,desligamento_processo_id)
  SELECT v.company_id,v.colaborador_id,c.unidade_id,c.setor_id,d,'ausencia_justificada','confirmada','sistema','Dispensa de comparecimento do aviso prévio (Art. 488, parágrafo único, CLT). Abonar no sistema externo de ponto.','nao','nao','analisada',now(),(p->>'ator')::uuid,false,false,true,'pendente','dispensa_aviso_art488',v.id FROM public.dp_colaboradores c WHERE c.id=v.colaborador_id AND c.company_id=v.company_id
  ON CONFLICT (desligamento_processo_id,data_operacional) WHERE desligamento_processo_id IS NOT NULL AND estado<>'cancelada' AND folga_id IS NULL DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.dp_aviso_ocorrencias(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_aviso_ocorrencias(uuid,jsonb) TO service_role;
ALTER FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) RENAME TO dp_desligamento_banco_aplicar_base;
CREATE OR REPLACE FUNCTION public.dp_desligamento_banco_aplicar(p_id uuid,p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM public.dp_desligamento_banco_aplicar_base(p_id,p);
 PERFORM private.dp_aviso_ocorrencias(p_id,p);
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION private.dp_aviso_encerrar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status IN ('cancelado','reconsiderado') AND OLD.status IS DISTINCT FROM NEW.status THEN
 UPDATE public.dp_ocorrencias SET estado='cancelada',cancelado_em=now(),cancelado_por=COALESCE(auth.uid(),NEW.criado_por),motivo_cancelamento='Aviso cancelado ou reconsiderado' WHERE desligamento_processo_id=NEW.id AND estado<>'cancelada'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_aviso_encerrar() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_aviso_encerrar() TO service_role;
CREATE TRIGGER dp_aviso_encerrar AFTER UPDATE OF status ON public.dp_desligamento_processos FOR EACH ROW EXECUTE FUNCTION private.dp_aviso_encerrar();
CREATE OR REPLACE FUNCTION private.dp_aviso_ocorrencia_proteger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD.desligamento_processo_id IS NOT NULL AND (NEW.desligamento_processo_id IS DISTINCT FROM OLD.desligamento_processo_id OR NEW.data_operacional IS DISTINCT FROM OLD.data_operacional OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id OR NEW.subtipo IS DISTINCT FROM OLD.subtipo) AND pg_trigger_depth()<=1 THEN RAISE EXCEPTION 'Altere o processo de desligamento de origem'; END IF;
 IF NEW.desligamento_processo_id IS NOT NULL THEN
 IF current_setting('role',true)='authenticated' AND (TG_OP='INSERT' OR NEW.estado IS DISTINCT FROM OLD.estado) THEN RAISE EXCEPTION 'Dispensa controlada pelo processo de desligamento'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dp_desligamento_processos p WHERE p.id=NEW.desligamento_processo_id AND p.company_id=NEW.company_id AND p.colaborador_id=NEW.colaborador_id) THEN RAISE EXCEPTION 'Processo incompatível'; END IF;
 NEW.impacta_assiduidade:='nao'; NEW.impacta_ferias:='nao'; NEW.assiduidade_risco:=false;
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_aviso_ocorrencia_proteger() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_aviso_ocorrencia_proteger() TO service_role;
CREATE TRIGGER zz_dp_aviso_ocorrencia_proteger BEFORE INSERT OR UPDATE ON public.dp_ocorrencias FOR EACH ROW EXECUTE FUNCTION private.dp_aviso_ocorrencia_proteger();
DO $$ DECLARE f text; BEGIN
 f:=pg_get_functiondef('public.dp_meu_desligamento()'::regprocedure);
 f:=replace(f,'''data_comunicacao'', p.data_comunicacao,','''data_comunicacao'', p.data_comunicacao, ''extrato_aviso'', p.extrato_aviso,'); EXECUTE f;
 f:=pg_get_functiondef('public.dp_preadmissao_efetivar_direto(uuid,date,boolean)'::regprocedure);
 IF position('-- Status e conferência exigidos' in f)=0 THEN RAISE EXCEPTION 'Ponto de herança não encontrado'; END IF;
 f:=replace(f,'-- Status e conferência exigidos',E'UPDATE public.dp_colaboradores SET possui_folha_ponto=COALESCE((v_a->>''possui_folha_ponto'')::boolean,possui_folha_ponto), folha_ponto_dispensa_justificativa=NULLIF(v_a->>''folha_ponto_dispensa_justificativa'','''') WHERE id=v_colab AND company_id=pa.company_id;\n  -- Status e conferência exigidos'); EXECUTE f;
END $$;
CREATE OR REPLACE FUNCTION private.dp_folga_aviso_rotular() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.desligamento_processo_id IS NOT NULL THEN
 UPDATE public.dp_ocorrencias SET subtipo='banco_horas_aviso',desligamento_processo_id=NEW.desligamento_processo_id,justificativa_inicial='Folga compensatória de banco de horas no aviso prévio. Abonar no sistema externo de ponto; sem impacto em assiduidade ou férias.' WHERE folga_id=NEW.id AND estado<>'cancelada'; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.dp_folga_aviso_rotular() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dp_folga_aviso_rotular() TO service_role;
CREATE TRIGGER zz_dp_folga_aviso_rotular AFTER INSERT OR UPDATE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION private.dp_folga_aviso_rotular();
