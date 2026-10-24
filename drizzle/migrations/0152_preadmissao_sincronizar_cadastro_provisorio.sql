CREATE OR REPLACE FUNCTION public.dp_preadmissao_sincronizar_rotina()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  c public.dp_colaboradores%ROWTYPE;
  a jsonb := COALESCE(NEW.admin_dados,'{}');
  d jsonb := COALESCE(NEW.dados,'{}');
  cid uuid;
  unidade uuid;
  cargo uuid;
  setor uuid;
  cfg public.dp_colaborador_config_trabalho%ROWTYPE;
  cfg_id uuid;
  dia jsonb;
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  grade jsonb;
BEGIN
  IF NEW.status IN ('concluido','cancelado') OR NEW.removido_em IS NOT NULL
     OR NEW.colaborador_id IS NOT NULL OR NULLIF(OLD.admin_dados->'rotina'->>'colaborador_id','') IS NULL THEN RETURN NEW; END IF;
  cid := NULLIF(a->'rotina'->>'colaborador_id','')::uuid;
  IF cid IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.dp_colaboradores WHERE id=cid AND company_id=NEW.company_id
    AND origem_cadastro='preadmissao_rotina' AND ativo AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  unidade := COALESCE(NULLIF(a->>'unidade_id','')::uuid,NEW.unidade_prevista_id,c.unidade_id);
  cargo := COALESCE(NULLIF(a->>'cargo_id','')::uuid,NEW.cargo_previsto_id,c.cargo_id);
  setor := CASE WHEN a ? 'setor_id' THEN NULLIF(a->>'setor_id','')::uuid ELSE c.setor_id END;
  IF unidade IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_unidades WHERE id=unidade AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Unidade incompatível com a empresa.' USING ERRCODE='check_violation'; END IF;
  IF cargo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_cargos WHERE id=cargo AND company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'Cargo incompatível com a empresa.' USING ERRCODE='check_violation'; END IF;
  IF setor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_setores WHERE id=setor AND company_id=NEW.company_id AND (unidade_id IS NULL OR unidade_id=unidade)) THEN
    RAISE EXCEPTION 'Setor habitual incompatível com a empresa ou unidade.' USING ERRCODE='check_violation'; END IF;
  UPDATE public.dp_colaboradores SET
    nome=COALESCE(NULLIF(upper(btrim(d->>'nome')),''),nome),
    telefone=CASE WHEN d ? 'telefone' THEN NULLIF(d->>'telefone','') ELSE telefone END,
    whatsapp=CASE WHEN d ? 'telefone' THEN NULLIF(d->>'telefone','') ELSE whatsapp END,
    email_contato=CASE WHEN d ? 'email' THEN NULLIF(lower(d->>'email'),'') ELSE email_contato END,
    cargo_id=cargo, unidade_id=unidade, setor_id=setor,
    possui_folha_ponto=CASE WHEN jsonb_typeof(a->'possui_folha_ponto')='boolean' THEN (a->>'possui_folha_ponto')::boolean ELSE possui_folha_ponto END,
    folha_ponto_dispensa_justificativa=CASE WHEN a ? 'folha_ponto_dispensa_justificativa' THEN NULLIF(a->>'folha_ponto_dispensa_justificativa','') ELSE folha_ponto_dispensa_justificativa END,
    salario_base=CASE WHEN NULLIF(a->>'salario','') IS NOT NULL THEN replace(replace(a->>'salario','.',''),',','.')::numeric ELSE salario_base END,
    forma_pagamento=CASE WHEN NULLIF(a->>'forma_pagamento','') IS NOT NULL THEN (a->>'forma_pagamento')::public.dp_forma_pagamento ELSE forma_pagamento END
  WHERE id=cid AND company_id=NEW.company_id;
  IF a->'jornada' IS DISTINCT FROM OLD.admin_dados->'jornada' OR unidade IS DISTINCT FROM c.unidade_id OR setor IS DISTINCT FROM c.setor_id THEN
    SELECT * INTO cfg FROM public.dp_colaborador_config_trabalho
      WHERE colaborador_id=cid AND company_id=NEW.company_id AND vigencia_fim IS NULL FOR UPDATE;
    grade := a->'jornada';
    IF cfg.id IS NOT NULL AND cfg.vigencia_inicio<=hoje THEN
      IF jsonb_typeof(grade->'dias')='array' THEN
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(grade->'dias') x WHERE COALESCE((x->>'trabalha')::boolean,false))
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(grade->'dias') x WHERE NOT COALESCE((x->>'trabalha')::boolean,false)) THEN
          RAISE EXCEPTION 'A semana precisa de trabalho e folga.' USING ERRCODE='check_violation'; END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(grade->'dias')) <> (SELECT count(DISTINCT (x->>'dow')::int) FROM jsonb_array_elements(grade->'dias') x) THEN
          RAISE EXCEPTION 'Dia repetido no horário de trabalho.' USING ERRCODE='check_violation'; END IF;
        FOR dia IN SELECT * FROM jsonb_array_elements(grade->'dias') LOOP
          IF (dia->>'dow')::int NOT BETWEEN 0 AND 6 OR (COALESCE((dia->>'trabalha')::boolean,false) AND (NULLIF(dia->>'entrada','') IS NULL OR NULLIF(dia->>'saida','') IS NULL)) THEN
            RAISE EXCEPTION 'Confira os dias e horários de trabalho.' USING ERRCODE='check_violation'; END IF;
          IF NULLIF(dia->>'setor_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_setores WHERE id=(dia->>'setor_id')::uuid AND company_id=NEW.company_id AND (unidade_id IS NULL OR unidade_id=unidade)) THEN
            RAISE EXCEPTION 'Setor do dia incompatível com a empresa ou unidade.' USING ERRCODE='check_violation'; END IF;
          IF NULLIF(dia->>'turno_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_turnos WHERE id=(dia->>'turno_id')::uuid AND company_id=NEW.company_id) THEN
            RAISE EXCEPTION 'Horário incompatível com a empresa.' USING ERRCODE='check_violation'; END IF;
        END LOOP;
      END IF;
      IF cfg.vigencia_inicio<hoje THEN
        UPDATE public.dp_colaborador_config_trabalho SET vigencia_fim=hoje-1 WHERE id=cfg.id;
        INSERT INTO public.dp_colaborador_config_trabalho(company_id,colaborador_id,unidade_id,turno_padrao_id,carga_semanal_horas,folga_variavel,folga_fixa_dow,observacoes,vigencia_inicio,compoe_equipe_habitual)
        VALUES(NEW.company_id,cid,unidade,cfg.turno_padrao_id,cfg.carga_semanal_horas,COALESCE((grade->>'folga_variavel')::boolean,cfg.folga_variavel),cfg.folga_fixa_dow,cfg.observacoes,hoje,cfg.compoe_equipe_habitual) RETURNING id INTO cfg_id;
      ELSE
        cfg_id:=cfg.id;
        UPDATE public.dp_colaborador_config_trabalho SET unidade_id=unidade,folga_variavel=COALESCE((grade->>'folga_variavel')::boolean,folga_variavel) WHERE id=cfg_id;
      END IF;
      IF jsonb_typeof(grade->'dias')='array' THEN
        INSERT INTO public.dp_colaborador_config_dias(company_id,config_id,dow,trabalha,turno_id,entrada,saida,intervalo_minutos,setor_id)
        SELECT NEW.company_id,cfg_id,(x->>'dow')::int,COALESCE((x->>'trabalha')::boolean,false),NULLIF(x->>'turno_id','')::uuid,
          CASE WHEN (x->>'trabalha')::boolean THEN NULLIF(x->>'entrada','')::time END,
          CASE WHEN (x->>'trabalha')::boolean THEN NULLIF(x->>'saida','')::time END,
          CASE WHEN (x->>'trabalha')::boolean THEN COALESCE((x->>'intervalo_minutos')::int,0) END,
          COALESCE(NULLIF(x->>'setor_id','')::uuid,(SELECT cd.setor_id FROM public.dp_colaborador_config_dias cd WHERE cd.config_id=cfg.id AND cd.dow=(x->>'dow')::int),CASE WHEN (x->>'trabalha')::boolean THEN setor END)
        FROM jsonb_array_elements(grade->'dias') x
        ON CONFLICT(config_id,dow) DO UPDATE SET trabalha=EXCLUDED.trabalha,turno_id=EXCLUDED.turno_id,entrada=EXCLUDED.entrada,saida=EXCLUDED.saida,intervalo_minutos=EXCLUDED.intervalo_minutos,setor_id=EXCLUDED.setor_id;
      ELSIF cfg_id<>cfg.id THEN
        INSERT INTO public.dp_colaborador_config_dias(company_id,config_id,dow,trabalha,turno_id,entrada,saida,intervalo_minutos,setor_id)
        SELECT company_id,cfg_id,dow,trabalha,turno_id,entrada,saida,intervalo_minutos,COALESCE(setor_id,CASE WHEN trabalha THEN setor END) FROM public.dp_colaborador_config_dias WHERE config_id=cfg.id;
      ELSE
        UPDATE public.dp_colaborador_config_dias SET setor_id=setor WHERE config_id=cfg_id AND trabalha AND setor_id IS NULL;
      END IF;
    END IF;
  END IF;
  INSERT INTO public.dp_preadmissao_eventos(preadmissao_id,company_id,evento,detalhe,actor_user_id)
    VALUES(NEW.id,NEW.company_id,'rotina_sincronizada',jsonb_build_object('colaborador_id',cid,'vigencia_operacional',hoje),auth.uid());
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.dp_preadmissao_sincronizar_rotina() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_sincronizar_rotina() TO service_role;
CREATE TRIGGER trg_dp_preadmissao_sincronizar_rotina AFTER UPDATE OF dados,admin_dados,cargo_previsto_id,unidade_prevista_id ON public.dp_preadmissoes FOR EACH ROW EXECUTE FUNCTION public.dp_preadmissao_sincronizar_rotina();