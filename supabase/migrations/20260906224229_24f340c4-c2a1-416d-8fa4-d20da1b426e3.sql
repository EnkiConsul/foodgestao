-- ============ ENUMS ============
CREATE TYPE public.dp_ocorrencia_tipo AS ENUM (
  'falta','previsao_falta','atraso','previsao_atraso','atestado','ausencia_justificada',
  'saida_antecipada','previsao_saida_antecipada','esquecimento_marcacao',
  'atraso_intervalo','previsao_atraso_intervalo','divergencia_jornada'
);
CREATE TYPE public.dp_ocorrencia_estado AS ENUM ('informada','aguardando_confirmacao','confirmada','cancelada');
CREATE TYPE public.dp_ocorrencia_impacto AS ENUM ('sim','nao','aguardando','nao_se_aplica');
CREATE TYPE public.dp_ocorrencia_origem AS ENUM ('colaborador','gestor','sistema');
CREATE TYPE public.dp_ocorrencia_analise_status AS ENUM ('pendente','analisada','nao_se_aplica');
CREATE TYPE public.dp_ocorrencia_marcacao AS ENUM ('entrada','saida','intervalo_inicio','intervalo_retorno');
CREATE TYPE public.dp_ocorrencia_tratativa_status AS ENUM ('pendente','concluida','nao_se_aplica');
CREATE TYPE public.dp_ocorrencia_cobertura_status AS ENUM ('proposta','aprovada','recusada');
CREATE TYPE public.dp_ocorrencia_cobertura_execucao AS ENUM ('prevista','realizada','nao_realizada');

-- ============ CONFIG ============
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS ocorrencia_prazo_retroativo_dias smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ocorrencia_cobertura_aprovacao text NOT NULL DEFAULT 'sempre';
ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT ck_dp_config_ocorrencia_prazo CHECK (ocorrencia_prazo_retroativo_dias BETWEEN 0 AND 90),
  ADD CONSTRAINT ck_dp_config_ocorrencia_cobertura CHECK (ocorrencia_cobertura_aprovacao IN ('sempre','colaborador_cadastrado','mesmo_cargo'));

-- ============ PADRÕES POR TIPO ============
CREATE TABLE public.dp_ocorrencia_tipo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo public.dp_ocorrencia_tipo NOT NULL,
  impacta_assiduidade public.dp_ocorrencia_impacto NOT NULL DEFAULT 'aguardando',
  impacta_ferias public.dp_ocorrencia_impacto NOT NULL DEFAULT 'aguardando',
  relevancia_operacional boolean NOT NULL DEFAULT true,
  exige_tratativa_ponto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tipo)
);
GRANT SELECT ON public.dp_ocorrencia_tipo_config TO authenticated;
GRANT ALL ON public.dp_ocorrencia_tipo_config TO service_role;
ALTER TABLE public.dp_ocorrencia_tipo_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ocorrencia_tipo_config_select" ON public.dp_ocorrencia_tipo_config
  FOR SELECT TO authenticated USING (private.is_company_member(auth.uid(), company_id));

-- ============ OCORRÊNCIAS ============
CREATE TABLE public.dp_ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  setor_id uuid REFERENCES public.dp_setores(id) ON DELETE SET NULL,
  data_operacional date NOT NULL,
  tipo public.dp_ocorrencia_tipo NOT NULL,
  estado public.dp_ocorrencia_estado NOT NULL DEFAULT 'informada',
  origem public.dp_ocorrencia_origem NOT NULL DEFAULT 'colaborador',
  previsto_entrada time,
  previsto_saida time,
  horario_previsto time,
  horario_estimado time,
  horario_real time,
  minutos integer,
  justificativa_inicial text,
  justificativa_final text,
  impacta_assiduidade public.dp_ocorrencia_impacto NOT NULL DEFAULT 'aguardando',
  impacta_ferias public.dp_ocorrencia_impacto NOT NULL DEFAULT 'aguardando',
  relevancia_operacional boolean NOT NULL DEFAULT true,
  analise_status public.dp_ocorrencia_analise_status NOT NULL DEFAULT 'pendente',
  analisado_por uuid,
  analisado_em timestamptz,
  tratativa_ponto boolean NOT NULL DEFAULT false,
  tratativa_status public.dp_ocorrencia_tratativa_status NOT NULL DEFAULT 'nao_se_aplica',
  tratativa_decisao text,
  tratativa_observacao text,
  marcacao_alvo public.dp_ocorrencia_marcacao,
  documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  solicitacao_id uuid REFERENCES public.dp_solicitacoes(id) ON DELETE SET NULL,
  informada_em timestamptz NOT NULL DEFAULT now(),
  antecedencia_minutos integer,
  cancelado_em timestamptz,
  cancelado_por uuid,
  motivo_cancelamento text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_dp_ocorrencia_tratativa CHECK (
    (tratativa_ponto AND tratativa_status IN ('pendente','concluida'))
    OR (NOT tratativa_ponto AND tratativa_status = 'nao_se_aplica')
  ),
  CONSTRAINT ck_dp_ocorrencia_marcacao CHECK (
    tipo <> 'esquecimento_marcacao' OR marcacao_alvo IS NOT NULL
  )
);
CREATE INDEX idx_dp_ocorrencias_dia ON public.dp_ocorrencias (company_id, data_operacional);
CREATE INDEX idx_dp_ocorrencias_colab ON public.dp_ocorrencias (colaborador_id, data_operacional);
CREATE INDEX idx_dp_ocorrencias_pendentes ON public.dp_ocorrencias (company_id, analise_status, tratativa_status)
  WHERE estado <> 'cancelada';
CREATE INDEX idx_dp_ocorrencias_dedup ON public.dp_ocorrencias
  (colaborador_id, data_operacional, tipo)
  WHERE estado <> 'cancelada';

GRANT SELECT ON public.dp_ocorrencias TO authenticated;
GRANT ALL ON public.dp_ocorrencias TO service_role;
ALTER TABLE public.dp_ocorrencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ocorrencias_select_empresa" ON public.dp_ocorrencias
  FOR SELECT TO authenticated USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "ocorrencias_select_propria" ON public.dp_ocorrencias
  FOR SELECT TO authenticated USING (colaborador_id = public.dp_colaborador_of(auth.uid()));

CREATE TRIGGER dp_ocorrencias_updated_at BEFORE UPDATE ON public.dp_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER dp_ocorrencias_validar_setor_trg BEFORE INSERT OR UPDATE OF setor_id ON public.dp_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.dp_colaborador_validar_setor();

-- ============ COBERTURAS ============
CREATE TABLE public.dp_ocorrencia_coberturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ocorrencia_id uuid NOT NULL REFERENCES public.dp_ocorrencias(id) ON DELETE CASCADE,
  substituto_colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE RESTRICT,
  mao_de_obra_extra_id uuid REFERENCES public.dp_pessoas_apoio(id) ON DELETE RESTRICT,
  entrada time,
  saida time,
  status public.dp_ocorrencia_cobertura_status NOT NULL DEFAULT 'proposta',
  execucao_status public.dp_ocorrencia_cobertura_execucao NOT NULL DEFAULT 'prevista',
  proposto_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  realizado_confirmado_por uuid,
  realizado_confirmado_em timestamptz,
  motivo_recusa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_dp_cobertura_pessoa CHECK (
    (substituto_colaborador_id IS NOT NULL) <> (mao_de_obra_extra_id IS NOT NULL)
  )
);
CREATE INDEX idx_dp_ocorrencia_coberturas_ocorrencia ON public.dp_ocorrencia_coberturas (ocorrencia_id);
GRANT SELECT ON public.dp_ocorrencia_coberturas TO authenticated;
GRANT ALL ON public.dp_ocorrencia_coberturas TO service_role;
ALTER TABLE public.dp_ocorrencia_coberturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ocorrencia_coberturas_select" ON public.dp_ocorrencia_coberturas
  FOR SELECT TO authenticated USING (private.is_company_member(auth.uid(), company_id));
CREATE TRIGGER dp_ocorrencia_coberturas_updated_at BEFORE UPDATE ON public.dp_ocorrencia_coberturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUDITORIA ============
CREATE TABLE public.dp_ocorrencia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ocorrencia_id uuid NOT NULL REFERENCES public.dp_ocorrencias(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  campo text,
  valor_anterior text,
  valor_novo text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  autor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dp_ocorrencia_eventos_ocorrencia ON public.dp_ocorrencia_eventos (ocorrencia_id, created_at DESC);
GRANT SELECT ON public.dp_ocorrencia_eventos TO authenticated;
GRANT ALL ON public.dp_ocorrencia_eventos TO service_role;
ALTER TABLE public.dp_ocorrencia_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ocorrencia_eventos_select" ON public.dp_ocorrencia_eventos
  FOR SELECT TO authenticated USING (private.is_company_member(auth.uid(), company_id));

-- ============ SEED DE PADRÕES ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_tipos_seed(_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.dp_ocorrencia_tipo_config
    (company_id, tipo, impacta_assiduidade, impacta_ferias, relevancia_operacional, exige_tratativa_ponto)
  VALUES
    (_company_id,'falta','aguardando','aguardando',true,true),
    (_company_id,'previsao_falta','aguardando','aguardando',true,false),
    (_company_id,'atraso','aguardando','nao',true,true),
    (_company_id,'previsao_atraso','aguardando','nao',true,false),
    (_company_id,'atestado','nao','aguardando',true,true),
    (_company_id,'ausencia_justificada','nao','nao',true,true),
    (_company_id,'saida_antecipada','aguardando','nao',true,true),
    (_company_id,'previsao_saida_antecipada','aguardando','nao',true,false),
    (_company_id,'esquecimento_marcacao','nao','nao',false,true),
    (_company_id,'atraso_intervalo','aguardando','nao',false,true),
    (_company_id,'previsao_atraso_intervalo','aguardando','nao',true,false),
    (_company_id,'divergencia_jornada','aguardando','nao',false,true)
  ON CONFLICT (company_id, tipo) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_ocorrencia_tipos_seed_on_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.dp_ocorrencia_tipos_seed(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER dp_ocorrencia_tipos_seed_trg AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.dp_ocorrencia_tipos_seed_on_company();

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.dp_ocorrencia_tipos_seed(c.id);
  END LOOP;
END $$;

-- ============ CONFIG RESOLVIDA ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_config(_company_id uuid)
RETURNS TABLE (prazo_retroativo_dias smallint, cobertura_aprovacao text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(c.ocorrencia_prazo_retroativo_dias, 3::smallint),
         COALESCE(c.ocorrencia_cobertura_aprovacao, 'sempre')
  FROM public.dp_config_dp c
  WHERE c.company_id = _company_id AND c.unidade_id IS NULL
  UNION ALL
  SELECT 3::smallint, 'sempre'
  LIMIT 1;
$$;

-- ============ HORÁRIO PREVISTO DA ROTINA ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_previsto(_colaborador_id uuid, _data date)
RETURNS TABLE (entrada time, saida time, unidade_id uuid, setor_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entrada time; v_saida time; v_unidade uuid; v_setor uuid;
BEGIN
  SELECT i.entrada, i.saida, e.unidade_id
    INTO v_entrada, v_saida, v_unidade
  FROM public.dp_escala_itens i
  JOIN public.dp_escalas e ON e.id = i.escala_id
  WHERE i.colaborador_id = _colaborador_id AND i.data = _data AND i.tipo = 'trabalho'
  ORDER BY (e.status = 'publicada') DESC, i.updated_at DESC
  LIMIT 1;

  IF v_unidade IS NULL THEN
    SELECT c.unidade_id INTO v_unidade FROM public.dp_colaboradores c WHERE c.id = _colaborador_id;
  END IF;

  BEGIN
    v_setor := public.dp_setor_previsto_id(_colaborador_id, _data);
  EXCEPTION WHEN OTHERS THEN v_setor := NULL;
  END;

  RETURN QUERY SELECT v_entrada, v_saida, v_unidade, v_setor;
END;
$$;

-- ============ REGISTRAR ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_registrar(
  _colaborador_id uuid,
  _data date,
  _tipo public.dp_ocorrencia_tipo,
  _justificativa text DEFAULT NULL,
  _horario_estimado time DEFAULT NULL,
  _horario_real time DEFAULT NULL,
  _marcacao_alvo public.dp_ocorrencia_marcacao DEFAULT NULL,
  _estado public.dp_ocorrencia_estado DEFAULT NULL,
  _documento_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company uuid; v_is_gestor boolean; v_self uuid;
  v_prazo smallint; v_prev record; v_cfg record;
  v_estado public.dp_ocorrencia_estado; v_previsto time; v_minutos integer;
  v_existente uuid; v_id uuid; v_antec integer;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_COLABORADOR_NAO_ENCONTRADO'; END IF;

  v_self := public.dp_colaborador_of(auth.uid());
  v_is_gestor := private.is_company_admin_or_owner(auth.uid(), v_company);
  IF NOT v_is_gestor AND v_self IS DISTINCT FROM _colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;

  SELECT prazo_retroativo_dias INTO v_prazo FROM public.dp_ocorrencia_config(v_company);
  IF NOT v_is_gestor AND _data < (CURRENT_DATE - v_prazo) THEN
    RAISE EXCEPTION 'OCORRENCIA_PRAZO_RETROATIVO';
  END IF;

  SELECT * INTO v_prev FROM public.dp_ocorrencia_previsto(_colaborador_id, _data);
  SELECT * INTO v_cfg FROM public.dp_ocorrencia_tipo_config
   WHERE company_id = v_company AND tipo = _tipo;

  v_previsto := CASE
    WHEN _tipo IN ('atraso','previsao_atraso') THEN v_prev.entrada
    WHEN _tipo IN ('saida_antecipada','previsao_saida_antecipada') THEN v_prev.saida
    ELSE NULL END;

  v_estado := COALESCE(_estado, CASE
    WHEN _tipo IN ('previsao_falta','previsao_atraso','previsao_saida_antecipada','previsao_atraso_intervalo')
      THEN 'aguardando_confirmacao'::public.dp_ocorrencia_estado
    ELSE 'informada'::public.dp_ocorrencia_estado END);

  IF _horario_real IS NOT NULL AND v_previsto IS NOT NULL THEN
    v_minutos := ABS(EXTRACT(EPOCH FROM (_horario_real - v_previsto)) / 60)::int;
  ELSIF _horario_estimado IS NOT NULL AND v_previsto IS NOT NULL THEN
    v_minutos := ABS(EXTRACT(EPOCH FROM (_horario_estimado - v_previsto)) / 60)::int;
  END IF;

  IF v_previsto IS NOT NULL THEN
    v_antec := GREATEST(0, (EXTRACT(EPOCH FROM ((_data + v_previsto) - now()::timestamp)) / 60)::int);
  END IF;

  SELECT id INTO v_existente FROM public.dp_ocorrencias
   WHERE colaborador_id = _colaborador_id AND data_operacional = _data
     AND estado <> 'cancelada'
     AND COALESCE(marcacao_alvo::text,'') = COALESCE(_marcacao_alvo::text,'')
     AND tipo IN (_tipo,
        CASE _tipo
          WHEN 'atraso' THEN 'previsao_atraso'::public.dp_ocorrencia_tipo
          WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
          WHEN 'falta' THEN 'previsao_falta'::public.dp_ocorrencia_tipo
          WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
          WHEN 'saida_antecipada' THEN 'previsao_saida_antecipada'::public.dp_ocorrencia_tipo
          WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
          WHEN 'atraso_intervalo' THEN 'previsao_atraso_intervalo'::public.dp_ocorrencia_tipo
          WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
          ELSE _tipo END)
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RAISE EXCEPTION 'OCORRENCIA_DUPLICADA:%', v_existente;
  END IF;

  INSERT INTO public.dp_ocorrencias (
    company_id, colaborador_id, unidade_id, setor_id, data_operacional, tipo, estado, origem,
    previsto_entrada, previsto_saida, horario_previsto, horario_estimado, horario_real, minutos,
    justificativa_inicial, impacta_assiduidade, impacta_ferias, relevancia_operacional,
    tratativa_ponto, tratativa_status, marcacao_alvo, documento_id,
    antecedencia_minutos, criado_por
  ) VALUES (
    v_company, _colaborador_id, v_prev.unidade_id, v_prev.setor_id, _data, _tipo, v_estado,
    CASE WHEN v_self IS NOT DISTINCT FROM _colaborador_id THEN 'colaborador'::public.dp_ocorrencia_origem
         ELSE 'gestor'::public.dp_ocorrencia_origem END,
    v_prev.entrada, v_prev.saida, v_previsto, _horario_estimado, _horario_real, v_minutos,
    NULLIF(btrim(COALESCE(_justificativa,'')),''),
    COALESCE(v_cfg.impacta_assiduidade,'aguardando'), COALESCE(v_cfg.impacta_ferias,'aguardando'),
    COALESCE(v_cfg.relevancia_operacional,true),
    COALESCE(v_cfg.exige_tratativa_ponto,false),
    CASE WHEN COALESCE(v_cfg.exige_tratativa_ponto,false) THEN 'pendente'::public.dp_ocorrencia_tratativa_status
         ELSE 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status END,
    _marcacao_alvo, _documento_id, v_antec, auth.uid()
  ) RETURNING id INTO v_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, valor_novo, metadata, autor_id)
  VALUES (v_company, v_id, 'ocorrencia_criada', _tipo::text,
          jsonb_build_object('estado', v_estado, 'data_operacional', _data), auth.uid());

  RETURN v_id;
END;
$$;

-- ============ CONFIRMAR (previsão -> fato) ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_confirmar(
  _ocorrencia_id uuid,
  _horario_real time DEFAULT NULL,
  _justificativa_final text DEFAULT NULL,
  _confirmar_falta boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_novo public.dp_ocorrencia_tipo; v_min integer; v_self uuid;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_of(auth.uid());
  IF NOT private.is_company_member(auth.uid(), o.company_id) AND v_self IS DISTINCT FROM o.colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;

  v_novo := CASE o.tipo
    WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
    WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
    WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
    WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
    ELSE o.tipo END;

  IF NOT _confirmar_falta THEN
    UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''),'Não se confirmou')
      WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'ocorrencia_cancelada', auth.uid());
    RETURN;
  END IF;

  IF _horario_real IS NOT NULL AND o.horario_previsto IS NOT NULL THEN
    v_min := ABS(EXTRACT(EPOCH FROM (_horario_real - o.horario_previsto)) / 60)::int;
  END IF;

  UPDATE public.dp_ocorrencias SET
    tipo = v_novo,
    estado = 'confirmada',
    horario_real = COALESCE(_horario_real, horario_real),
    minutos = COALESCE(v_min, minutos),
    justificativa_final = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''), justificativa_final)
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'previsao_confirmada', 'tipo', o.tipo::text, v_novo::text,
          jsonb_build_object('horario_real', _horario_real, 'minutos', v_min), auth.uid());
END;
$$;

-- ============ COMPLEMENTAR JUSTIFICATIVA ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_complementar(_ocorrencia_id uuid, _texto text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_self uuid;
BEGIN
  IF COALESCE(btrim(_texto),'') = '' THEN RAISE EXCEPTION 'OCORRENCIA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_of(auth.uid());
  IF NOT private.is_company_member(auth.uid(), o.company_id) AND v_self IS DISTINCT FROM o.colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  UPDATE public.dp_ocorrencias SET justificativa_final = btrim(_texto) WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
  VALUES (o.company_id, _ocorrencia_id,
          CASE WHEN o.justificativa_final IS NULL THEN 'justificativa_enviada' ELSE 'justificativa_complementada' END,
          'justificativa_final', o.justificativa_final, btrim(_texto), auth.uid());
END;
$$;

-- ============ CLASSIFICAR IMPACTOS ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_classificar(
  _ocorrencia_id uuid,
  _impacta_assiduidade public.dp_ocorrencia_impacto DEFAULT NULL,
  _impacta_ferias public.dp_ocorrencia_impacto DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_member(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;

  IF _impacta_assiduidade IS NOT NULL AND _impacta_assiduidade <> o.impacta_assiduidade THEN
    UPDATE public.dp_ocorrencias SET impacta_assiduidade = _impacta_assiduidade WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'impacto_alterado', 'impacta_assiduidade', o.impacta_assiduidade::text, _impacta_assiduidade::text, auth.uid());
  END IF;

  IF _impacta_ferias IS NOT NULL AND _impacta_ferias <> o.impacta_ferias THEN
    UPDATE public.dp_ocorrencias SET impacta_ferias = _impacta_ferias WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'impacto_alterado', 'impacta_ferias', o.impacta_ferias::text, _impacta_ferias::text, auth.uid());
  END IF;
END;
$$;

-- ============ ANALISAR ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_analisar(
  _ocorrencia_id uuid,
  _status public.dp_ocorrencia_analise_status,
  _observacao text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_member(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
  UPDATE public.dp_ocorrencias SET analise_status = _status,
      analisado_por = CASE WHEN _status = 'pendente' THEN NULL ELSE auth.uid() END,
      analisado_em = CASE WHEN _status = 'pendente' THEN NULL ELSE now() END
   WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'analise_atualizada', 'analise_status', o.analise_status::text, _status::text,
          jsonb_build_object('observacao', NULLIF(btrim(COALESCE(_observacao,'')),'')), auth.uid());
END;
$$;

-- ============ TRATATIVA DE PONTO ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_tratar(
  _ocorrencia_id uuid,
  _decisao text,
  _observacao text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  IF _decisao NOT IN ('confirmada','ajuste_solicitado','nao_se_aplica') THEN
    RAISE EXCEPTION 'OCORRENCIA_TRATATIVA_INVALIDA';
  END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  IF NOT private.is_company_member(auth.uid(), o.company_id) THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;

  UPDATE public.dp_ocorrencias SET
    tratativa_ponto = (_decisao <> 'nao_se_aplica'),
    tratativa_status = CASE WHEN _decisao = 'nao_se_aplica' THEN 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status
                            ELSE 'concluida'::public.dp_ocorrencia_tratativa_status END,
    tratativa_decisao = CASE WHEN _decisao = 'nao_se_aplica' THEN NULL ELSE _decisao END,
    tratativa_observacao = NULLIF(btrim(COALESCE(_observacao,'')),'')
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'tratativa_concluida', 'tratativa_decisao', o.tratativa_decisao, _decisao,
          jsonb_build_object('observacao', NULLIF(btrim(COALESCE(_observacao,'')),'')), auth.uid());
END;
$$;

-- ============ CANCELAR ============
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_cancelar(_ocorrencia_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_self uuid; v_prazo smallint;
BEGIN
  IF COALESCE(btrim(_motivo),'') = '' THEN RAISE EXCEPTION 'OCORRENCIA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_of(auth.uid());
  IF NOT private.is_company_member(auth.uid(), o.company_id) THEN
    IF v_self IS DISTINCT FROM o.colaborador_id THEN RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO'; END IF;
    IF o.analise_status <> 'pendente' THEN RAISE EXCEPTION 'OCORRENCIA_JA_ANALISADA'; END IF;
    SELECT prazo_retroativo_dias INTO v_prazo FROM public.dp_ocorrencia_config(o.company_id);
    IF o.data_operacional < (CURRENT_DATE - v_prazo) THEN RAISE EXCEPTION 'OCORRENCIA_PRAZO_RETROATIVO'; END IF;
  END IF;
  UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
    motivo_cancelamento = btrim(_motivo) WHERE id = _ocorrencia_id;
  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, valor_novo, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'ocorrencia_cancelada', btrim(_motivo), auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_previsto(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_registrar(uuid, date, public.dp_ocorrencia_tipo, text, time, time, public.dp_ocorrencia_marcacao, public.dp_ocorrencia_estado, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_confirmar(uuid, time, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_complementar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_classificar(uuid, public.dp_ocorrencia_impacto, public.dp_ocorrencia_impacto) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_analisar(uuid, public.dp_ocorrencia_analise_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_tratar(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cancelar(uuid, text) TO authenticated;