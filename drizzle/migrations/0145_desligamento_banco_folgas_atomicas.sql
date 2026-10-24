ALTER TABLE public.dp_desligamento_processos ADD COLUMN saldo_banco_minutos integer NOT NULL DEFAULT 0, ADD COLUMN saldo_residual_minutos integer NOT NULL DEFAULT 0, ADD COLUMN folgas_compensatorias jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.dp_folgas ADD COLUMN desligamento_processo_id uuid REFERENCES public.dp_desligamento_processos(id);
CREATE INDEX dp_folgas_desligamento_idx ON public.dp_folgas(desligamento_processo_id) WHERE desligamento_processo_id IS NOT NULL;
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('public.dp_desligamento_registrar_aviso(jsonb)'::regprocedure), 'FUNCTION public.dp_desligamento_registrar_aviso(', 'FUNCTION public.dp_desligamento_registrar_aviso_sem_banco(');
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_registrar_aviso_sem_banco(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_registrar_aviso_sem_banco(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_desligamento_banco_aplicar(p_id uuid, p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.dp_desligamento_processos%ROWTYPE; d date; f public.dp_folgas%ROWTYPE; saldo integer := COALESCE((p->>'saldo_banco_minutos')::int,0); residual integer := COALESCE((p->>'saldo_residual_minutos')::int,0); datas jsonb := COALESCE(p->'folgas_compensatorias','[]'::jsonb);
BEGIN
 SELECT * INTO v FROM public.dp_desligamento_processos WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v.status <> 'aviso_em_curso' THEN RAISE EXCEPTION 'Aviso não está em andamento'; END IF;
 IF saldo<0 OR saldo>525600 OR residual<0 OR residual>saldo OR jsonb_typeof(datas)<>'array' OR jsonb_array_length(datas)>90 THEN RAISE EXCEPTION 'Saldo ou folgas inválidos'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements_text(datas)) <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(datas)) THEN RAISE EXCEPTION 'Folgas repetidas'; END IF;
 IF jsonb_array_length(datas)>0 AND (v.modalidade NOT IN ('trabalhado','misto') OR v.motivo::text NOT IN ('dispensa_sem_justa_causa','pedido_demissao','acordo_mutuo')) THEN RAISE EXCEPTION 'Este aviso não permite compensação'; END IF;
 FOR d IN SELECT value::date FROM jsonb_array_elements_text(datas) LOOP
   IF d<v.inicio_aviso OR d>v.data_efetiva THEN RAISE EXCEPTION 'Folga fora do aviso'; END IF;
 END LOOP;
 FOR f IN SELECT * FROM public.dp_folgas WHERE desligamento_processo_id=v.id AND status='agendada' AND NOT (datas ? data::text) FOR UPDATE LOOP
   UPDATE public.dp_folgas SET status='cancelada',updated_at=now() WHERE id=f.id;
   INSERT INTO public.dp_folgas_canceladas(company_id,colaborador_id,folga_id,data,motivo,origem_cancelamento,cancelado_por) VALUES(f.company_id,f.colaborador_id,f.id,f.data,'Condições do desligamento alteradas','desligamento',(p->>'ator')::uuid);
 END LOOP;
 UPDATE public.dp_desligamento_processos SET saldo_banco_minutos=saldo,saldo_residual_minutos=residual,folgas_compensatorias=datas WHERE id=v.id;
 FOR d IN SELECT value::date FROM jsonb_array_elements_text(datas) LOOP
   IF EXISTS(SELECT 1 FROM public.dp_folgas WHERE colaborador_id=v.colaborador_id AND company_id=v.company_id AND data=d AND status<>'cancelada' AND desligamento_processo_id IS DISTINCT FROM v.id) THEN RAISE EXCEPTION 'A agenda mudou: existe outra folga em %; recalcule',d; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.dp_folgas WHERE desligamento_processo_id=v.id AND data=d AND status='agendada') THEN
     INSERT INTO public.dp_folgas(company_id,colaborador_id,data,tipo,origem,status,extra,observacao,criado_por,direito_origem,desligamento_processo_id)
       VALUES(v.company_id,v.colaborador_id,d,'extra','admin_manual','agendada',true,'Compensação de banco no aviso prévio; conferida pelo gestor',(p->>'ator')::uuid,'banco_horas_desligamento',v.id);
   END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_desligamento_registrar_aviso(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 r:=public.dp_desligamento_registrar_aviso_sem_banco(p);
 IF COALESCE((r->>'repetido')::boolean,false) THEN RETURN r; END IF;
 PERFORM public.dp_desligamento_banco_aplicar((r->>'id')::uuid,p);
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_registrar_aviso(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_registrar_aviso(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_desligamento_banco_encerrar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.dp_folgas%ROWTYPE;
BEGIN
 IF NEW.status IN ('cancelado','reconsiderado') AND OLD.status IS DISTINCT FROM NEW.status THEN
  FOR f IN SELECT * FROM public.dp_folgas WHERE desligamento_processo_id=NEW.id AND status='agendada' FOR UPDATE LOOP
   UPDATE public.dp_folgas SET status='cancelada',updated_at=now() WHERE id=f.id;
   INSERT INTO public.dp_folgas_canceladas(company_id,colaborador_id,folga_id,data,motivo,origem_cancelamento,cancelado_por) VALUES(f.company_id,f.colaborador_id,f.id,f.data,'Aviso encerrado: '||NEW.status,'desligamento',COALESCE(auth.uid(),NEW.criado_por));
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_banco_encerrar() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_banco_encerrar() TO service_role;
CREATE TRIGGER dp_desligamento_banco_encerrar AFTER UPDATE OF status ON public.dp_desligamento_processos FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_banco_encerrar();
CREATE OR REPLACE FUNCTION public.dp_desligamento_banco_proteger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.desligamento_processo_id IS NOT NULL THEN RAISE EXCEPTION 'Folga vinculada ao desligamento: altere as condições do aviso'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND OLD.desligamento_processo_id IS NOT NULL AND current_setting('role',true)='authenticated' THEN RAISE EXCEPTION 'Folga vinculada ao desligamento: altere as condições do aviso'; END IF;
 IF NEW.desligamento_processo_id IS NOT NULL THEN
  IF current_setting('role',true)='authenticated' THEN RAISE EXCEPTION 'Registro de compensação somente pelo aviso'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dp_desligamento_processos p WHERE p.id=NEW.desligamento_processo_id AND p.company_id=NEW.company_id AND p.colaborador_id=NEW.colaborador_id AND NEW.data BETWEEN p.inicio_aviso AND p.data_efetiva AND p.folgas_compensatorias ? NEW.data::text) THEN RAISE EXCEPTION 'Compensação incompatível com o aviso'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_banco_proteger() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_banco_proteger() TO service_role;
CREATE TRIGGER dp_desligamento_banco_proteger BEFORE INSERT OR UPDATE OR DELETE ON public.dp_folgas FOR EACH ROW EXECUTE FUNCTION public.dp_desligamento_banco_proteger();
CREATE OR REPLACE FUNCTION public.dp_desligamento_transicao(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 IF p->>'acao'='ocorrencia' AND (p->>'aplicar_termino')::boolean IS TRUE THEN
  PERFORM public.dp_desligamento_termino_guard(p);
  IF (p->>'data')::date>(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'O último dia trabalhado não pode ser futuro: registre depois que ele ocorrer.'; END IF;
 END IF;
 r:=public.dp_desligamento_transicao_nucleo(p);
 IF p->>'acao'='alterar' AND NOT COALESCE((r->>'repetido')::boolean,false) THEN PERFORM public.dp_desligamento_banco_aplicar((p->>'processo_id')::uuid,p); END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_transicao(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_transicao(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.dp_desligamento_agenda_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_lim date;
BEGIN
 IF NEW.colaborador_id IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='dp_folgas' THEN
  IF NEW.desligamento_processo_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.dp_desligamento_processos p WHERE p.id=NEW.desligamento_processo_id AND p.company_id=NEW.company_id AND p.colaborador_id=NEW.colaborador_id AND NEW.data BETWEEN p.inicio_aviso AND p.data_efetiva AND p.folgas_compensatorias ? NEW.data::text) THEN RETURN NEW; END IF;
 END IF;
 v_lim:=public.dp_desligamento_limite_agenda(NEW.colaborador_id);
 IF v_lim IS NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='dp_ferias_gozos' THEN
  IF TG_OP='UPDATE' AND NEW.data_inicio IS NOT DISTINCT FROM OLD.data_inicio AND NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim THEN RETURN NEW; END IF;
  IF NEW.data_fim>v_lim THEN RAISE EXCEPTION 'Colaborador em aviso prévio: férias depois do último dia de trabalho precisam de revisão do RH.' USING HINT='aviso_previo_agenda'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.data IS NOT DISTINCT FROM OLD.data THEN
  IF TG_TABLE_NAME<>'dp_escala_itens' THEN RETURN NEW; END IF;
  IF NEW.tipo IS NOT DISTINCT FROM OLD.tipo THEN RETURN NEW; END IF;
 END IF;
 IF NEW.data<=v_lim THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='dp_escala_itens' AND NEW.tipo<>'trabalho' THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Colaborador em aviso prévio: o último dia de trabalho é %. Não é possível escalar trabalho depois dessa data.',to_char(v_lim,'DD/MM/YYYY') USING HINT='aviso_previo_agenda';
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_agenda_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_agenda_guard() TO service_role;