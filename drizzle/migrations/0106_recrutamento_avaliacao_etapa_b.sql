-- Etapa B: Avaliação Food Service 360. Rollback: DROP das funções recrutamento_aval_* e tabelas recrutamento_aval_config, recrutamento_questoes, recrutamento_avaliacao_itens, recrutamento_avaliacoes; coluna visivel_empresas.

CREATE TABLE public.recrutamento_aval_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  segundos_por_pergunta int NOT NULL DEFAULT 60 CHECK (segundos_por_pergunta BETWEEN 20 AND 600),
  tolerancia_segundos int NOT NULL DEFAULT 5 CHECK (tolerancia_segundos BETWEEN 0 AND 30),
  validade_meses int NOT NULL DEFAULT 12,
  reaplicar_dias int NOT NULL DEFAULT 90,
  versao_banco int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.recrutamento_aval_config TO service_role;
ALTER TABLE public.recrutamento_aval_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.recrutamento_aval_config (id) VALUES (true);

CREATE TABLE public.recrutamento_questoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  versao int NOT NULL DEFAULT 1,
  area text NOT NULL CHECK (area IN ('geral','cozinha','salao','caixa','delivery','bar','limpeza','estoque','gestao')),
  competencia text NOT NULL,
  enunciado text NOT NULL,
  opcoes jsonb NOT NULL,
  justificativa text,
  ativa boolean NOT NULL DEFAULT true,
  revisada_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo, versao)
);
GRANT ALL ON public.recrutamento_questoes TO service_role;
ALTER TABLE public.recrutamento_questoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.recrutamento_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.recrutamento_candidatos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('completa','complemento')),
  base_id uuid REFERENCES public.recrutamento_avaliacoes(id),
  areas text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluida')),
  versao_banco int NOT NULL,
  segundos_por_pergunta int NOT NULL,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  valida_ate timestamptz,
  pontos int, pontos_max int,
  pontos_gerais int, max_gerais int,
  pontos_especificos int, max_especificos int,
  faixa text
);
CREATE UNIQUE INDEX recrutamento_aval_uma_aberta ON public.recrutamento_avaliacoes(candidato_id) WHERE status = 'em_andamento';
CREATE INDEX recrutamento_aval_cand_idx ON public.recrutamento_avaliacoes(candidato_id, concluida_em DESC);
GRANT SELECT ON public.recrutamento_avaliacoes TO authenticated;
GRANT ALL ON public.recrutamento_avaliacoes TO service_role;
ALTER TABLE public.recrutamento_avaliacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY rec_aval_select_proprio ON public.recrutamento_avaliacoes FOR SELECT TO authenticated
  USING (candidato_id IN (SELECT c.id FROM public.recrutamento_candidatos c WHERE c.user_id = auth.uid()));

CREATE TABLE public.recrutamento_avaliacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliacao_id uuid NOT NULL REFERENCES public.recrutamento_avaliacoes(id) ON DELETE CASCADE,
  ordem int NOT NULL,
  questao_id uuid NOT NULL REFERENCES public.recrutamento_questoes(id),
  area text NOT NULL,
  ordem_opcoes text[] NOT NULL,
  liberada_em timestamptz,
  prazo_em timestamptz,
  resposta text,
  respondida_em timestamptz,
  expirada boolean NOT NULL DEFAULT false,
  pontos int,
  UNIQUE (avaliacao_id, ordem),
  UNIQUE (avaliacao_id, questao_id)
);
GRANT ALL ON public.recrutamento_avaliacao_itens TO service_role;
ALTER TABLE public.recrutamento_avaliacao_itens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recrutamento_candidatos ADD COLUMN visivel_empresas boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._rec_aval_areas_cobertas(_cand uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT a), '{}') FROM (
    SELECT unnest(av.areas) a FROM public.recrutamento_avaliacoes av
    WHERE av.candidato_id = _cand AND av.status = 'concluida' AND av.valida_ate > now()
  ) s $$;
REVOKE ALL ON FUNCTION public._rec_aval_areas_cobertas(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recrutamento_candidatos_visibilidade_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visivel_empresas AND NOT coalesce(OLD.visivel_empresas, false)
     AND coalesce(array_length(public._rec_aval_areas_cobertas(NEW.id),1),0) = 0 THEN
    RAISE EXCEPTION 'Conclua a Avaliação Food Service antes de ativar o perfil.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recrutamento_candidatos_visibilidade BEFORE UPDATE ON public.recrutamento_candidatos
  FOR EACH ROW EXECUTE FUNCTION public.recrutamento_candidatos_visibilidade_guard();

-- Cria itens para uma avaliação
CREATE OR REPLACE FUNCTION public._rec_aval_criar_itens(_aval uuid, _areas text[], _com_gerais boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ids uuid[]; _a text;
BEGIN
  _ids := '{}';
  IF _com_gerais THEN
    _ids := _ids || ARRAY(SELECT q.id FROM public.recrutamento_questoes q
      WHERE q.area = 'geral' AND q.ativa ORDER BY random() LIMIT 6);
  END IF;
  FOREACH _a IN ARRAY _areas LOOP
    _ids := _ids || ARRAY(SELECT q.id FROM public.recrutamento_questoes q
      WHERE q.area = _a AND q.ativa ORDER BY random() LIMIT 2);
  END LOOP;
  IF coalesce(array_length(_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'Banco de perguntas indisponível.' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.recrutamento_avaliacao_itens (avaliacao_id, ordem, questao_id, area, ordem_opcoes)
  SELECT _aval, row_number() OVER (ORDER BY random()), q.id, q.area,
    ARRAY(SELECT o->>'id' FROM jsonb_array_elements(q.opcoes) o ORDER BY random())
  FROM public.recrutamento_questoes q WHERE q.id = ANY(_ids);
END $$;
REVOKE ALL ON FUNCTION public._rec_aval_criar_itens(uuid, text[], boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._rec_aval_afins(_a text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _a
    WHEN 'cozinha' THEN ARRAY['limpeza','estoque'] WHEN 'salao' THEN ARRAY['caixa','bar']
    WHEN 'caixa' THEN ARRAY['salao','delivery'] WHEN 'delivery' THEN ARRAY['caixa','salao']
    WHEN 'bar' THEN ARRAY['salao','caixa'] WHEN 'limpeza' THEN ARRAY['cozinha','estoque']
    WHEN 'estoque' THEN ARRAY['cozinha','gestao'] WHEN 'gestao' THEN ARRAY['salao','cozinha']
    ELSE ARRAY[]::text[] END $$;

CREATE OR REPLACE FUNCTION public._rec_aval_finalizar(_aval uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _av public.recrutamento_avaliacoes; _pct numeric; _cfg public.recrutamento_aval_config;
BEGIN
  SELECT * INTO _cfg FROM public.recrutamento_aval_config;
  SELECT * INTO _av FROM public.recrutamento_avaliacoes WHERE id = _aval FOR UPDATE;
  IF _av.status = 'concluida' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.recrutamento_avaliacao_itens WHERE avaliacao_id = _aval AND pontos IS NULL) THEN RETURN; END IF;
  SELECT coalesce(sum(pontos),0) p, count(*)*2 m,
    coalesce(sum(pontos) FILTER (WHERE area='geral'),0) pg, count(*) FILTER (WHERE area='geral')*2 mg,
    coalesce(sum(pontos) FILTER (WHERE area<>'geral'),0) pe, count(*) FILTER (WHERE area<>'geral')*2 me
  INTO r FROM public.recrutamento_avaliacao_itens WHERE avaliacao_id = _aval;
  _pct := CASE WHEN r.m > 0 THEN r.p::numeric * 100 / r.m ELSE 0 END;
  UPDATE public.recrutamento_avaliacoes SET status='concluida', concluida_em=now(),
    valida_ate = CASE WHEN tipo='completa' THEN now() + make_interval(months => _cfg.validade_meses)
      ELSE (SELECT b.valida_ate FROM public.recrutamento_avaliacoes b WHERE b.id = _av.base_id) END,
    pontos=r.p, pontos_max=r.m, pontos_gerais=r.pg, max_gerais=r.mg, pontos_especificos=r.pe, max_especificos=r.me,
    faixa = CASE WHEN _pct >= 75 THEN 'alinhado' WHEN _pct >= 50 THEN 'parcial' ELSE 'orientacao' END
  WHERE id = _aval;
END $$;
REVOKE ALL ON FUNCTION public._rec_aval_finalizar(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._rec_cand_atual() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.recrutamento_candidatos WHERE user_id = auth.uid() $$;
REVOKE ALL ON FUNCTION public._rec_cand_atual() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.recrutamento_aval_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.recrutamento_candidatos; _ult public.recrutamento_avaliacoes; _cfg public.recrutamento_aval_config; _aberta uuid;
BEGIN
  SELECT * INTO _c FROM public.recrutamento_candidatos WHERE user_id = auth.uid();
  IF _c.id IS NULL THEN RETURN jsonb_build_object('tem_perfil', false); END IF;
  SELECT * INTO _cfg FROM public.recrutamento_aval_config;
  SELECT id INTO _aberta FROM public.recrutamento_avaliacoes WHERE candidato_id=_c.id AND status='em_andamento';
  SELECT * INTO _ult FROM public.recrutamento_avaliacoes WHERE candidato_id=_c.id AND status='concluida' AND tipo='completa'
    ORDER BY concluida_em DESC LIMIT 1;
  RETURN jsonb_build_object(
    'tem_perfil', true,
    'perfil_completo', coalesce(array_length(_c.areas,1),0) > 0,
    'areas_perfil', to_jsonb(_c.areas),
    'em_andamento', _aberta IS NOT NULL,
    'areas_cobertas', to_jsonb(public._rec_aval_areas_cobertas(_c.id)),
    'valida', _ult.id IS NOT NULL AND _ult.valida_ate > now(),
    'valida_ate', _ult.valida_ate,
    'concluida_em', _ult.concluida_em,
    'nova_tentativa_em', CASE WHEN _ult.id IS NULL THEN NULL ELSE _ult.concluida_em + make_interval(days => _cfg.reaplicar_dias) END,
    'faixa', _ult.faixa,
    'pct_gerais', CASE WHEN _ult.max_gerais > 0 THEN round(_ult.pontos_gerais::numeric*100/_ult.max_gerais) END,
    'pct_especificos', CASE WHEN _ult.max_especificos > 0 THEN round(_ult.pontos_especificos::numeric*100/_ult.max_especificos) END,
    'segundos_por_pergunta', _cfg.segundos_por_pergunta,
    'visivel_empresas', _c.visivel_empresas);
END $$;

CREATE OR REPLACE FUNCTION public.recrutamento_aval_iniciar(p_area text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.recrutamento_candidatos; _cfg public.recrutamento_aval_config; _ult public.recrutamento_avaliacoes;
  _aberta uuid; _novo uuid; _areas text[] := '{}'; _a text; _cob text[];
BEGIN
  SELECT * INTO _c FROM public.recrutamento_candidatos WHERE user_id = auth.uid() FOR UPDATE;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Perfil de candidato não encontrado.' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(_c.areas,1),0) = 0 THEN RAISE EXCEPTION 'Complete seu perfil profissional antes da avaliação.' USING ERRCODE='P0001'; END IF;
  IF p_area IS NOT NULL AND p_area NOT IN ('cozinha','salao','caixa','delivery','bar','limpeza','estoque','gestao') THEN
    RAISE EXCEPTION 'Área inválida.' USING ERRCODE='22023'; END IF;
  SELECT id INTO _aberta FROM public.recrutamento_avaliacoes WHERE candidato_id=_c.id AND status='em_andamento';
  IF _aberta IS NOT NULL THEN RETURN jsonb_build_object('avaliacao_id', _aberta, 'retomada', true); END IF;
  SELECT * INTO _cfg FROM public.recrutamento_aval_config;
  SELECT * INTO _ult FROM public.recrutamento_avaliacoes WHERE candidato_id=_c.id AND status='concluida' AND tipo='completa'
    ORDER BY concluida_em DESC LIMIT 1;
  _cob := public._rec_aval_areas_cobertas(_c.id);

  IF _ult.id IS NOT NULL AND _ult.valida_ate > now() THEN
    IF p_area IS NOT NULL AND NOT (p_area = ANY(_cob)) THEN
      INSERT INTO public.recrutamento_avaliacoes (candidato_id, tipo, base_id, areas, versao_banco, segundos_por_pergunta)
        VALUES (_c.id, 'complemento', _ult.id, ARRAY[p_area], _cfg.versao_banco, _cfg.segundos_por_pergunta) RETURNING id INTO _novo;
      PERFORM public._rec_aval_criar_itens(_novo, ARRAY[p_area], false);
      RETURN jsonb_build_object('avaliacao_id', _novo, 'tipo', 'complemento');
    END IF;
    IF now() < _ult.concluida_em + make_interval(days => _cfg.reaplicar_dias) THEN
      RAISE EXCEPTION 'Sua avaliação está válida. Nova tentativa a partir de %.',
        to_char((_ult.concluida_em + make_interval(days => _cfg.reaplicar_dias)) AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
        USING ERRCODE='P0001';
    END IF;
  END IF;

  IF p_area IS NOT NULL THEN _areas := ARRAY[p_area]; END IF;
  FOREACH _a IN ARRAY _c.areas LOOP
    IF array_length(_areas,1) IS NULL OR (array_length(_areas,1) < 3 AND NOT (_a = ANY(_areas))) THEN _areas := _areas || _a; END IF;
  END LOOP;
  FOREACH _a IN ARRAY public._rec_aval_afins(_areas[1]) || public._rec_aval_afins(coalesce(_areas[2],_areas[1])) || ARRAY['salao','cozinha','limpeza'] LOOP
    IF array_length(_areas,1) < 3 AND NOT (_a = ANY(_areas)) THEN _areas := _areas || _a; END IF;
  END LOOP;

  INSERT INTO public.recrutamento_avaliacoes (candidato_id, tipo, areas, versao_banco, segundos_por_pergunta)
    VALUES (_c.id, 'completa', _areas, _cfg.versao_banco, _cfg.segundos_por_pergunta) RETURNING id INTO _novo;
  PERFORM public._rec_aval_criar_itens(_novo, _areas, true);
  RETURN jsonb_build_object('avaliacao_id', _novo, 'tipo', 'completa');
END $$;

CREATE OR REPLACE FUNCTION public.recrutamento_aval_atual()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cand uuid; _av public.recrutamento_avaliacoes; _it public.recrutamento_avaliacao_itens; _q public.recrutamento_questoes;
  _cfg public.recrutamento_aval_config; _total int; _opc jsonb;
BEGIN
  _cand := public._rec_cand_atual();
  IF _cand IS NULL THEN RAISE EXCEPTION 'Perfil de candidato não encontrado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO _cfg FROM public.recrutamento_aval_config;
  SELECT * INTO _av FROM public.recrutamento_avaliacoes WHERE candidato_id=_cand AND status='em_andamento' FOR UPDATE;
  IF _av.id IS NULL THEN RETURN jsonb_build_object('em_andamento', false); END IF;
  -- prazos vencidos viram 0 ponto, sem bloquear o candidato
  UPDATE public.recrutamento_avaliacao_itens SET expirada=true, pontos=0
    WHERE avaliacao_id=_av.id AND pontos IS NULL AND prazo_em IS NOT NULL
      AND now() > prazo_em + make_interval(secs => _cfg.tolerancia_segundos);
  SELECT * INTO _it FROM public.recrutamento_avaliacao_itens WHERE avaliacao_id=_av.id AND pontos IS NULL ORDER BY ordem LIMIT 1;
  IF _it.id IS NULL THEN
    PERFORM public._rec_aval_finalizar(_av.id);
    RETURN jsonb_build_object('em_andamento', false, 'concluida', true, 'avaliacao_id', _av.id);
  END IF;
  IF _it.liberada_em IS NULL THEN
    UPDATE public.recrutamento_avaliacao_itens SET liberada_em=now(), prazo_em=now()+make_interval(secs => _av.segundos_por_pergunta)
      WHERE id=_it.id RETURNING * INTO _it;
  END IF;
  SELECT * INTO _q FROM public.recrutamento_questoes WHERE id=_it.questao_id;
  SELECT jsonb_agg(jsonb_build_object('id', o->>'id', 'texto', o->>'texto') ORDER BY array_position(_it.ordem_opcoes, o->>'id'))
    INTO _opc FROM jsonb_array_elements(_q.opcoes) o;
  SELECT count(*) INTO _total FROM public.recrutamento_avaliacao_itens WHERE avaliacao_id=_av.id;
  RETURN jsonb_build_object('em_andamento', true, 'avaliacao_id', _av.id, 'tipo', _av.tipo,
    'item_id', _it.id, 'ordem', _it.ordem, 'total', _total,
    'area', _it.area, 'competencia', _q.competencia, 'enunciado', _q.enunciado, 'opcoes', _opc,
    'prazo_em', _it.prazo_em, 'segundos_restantes', greatest(0, ceil(extract(epoch FROM _it.prazo_em - now())))::int);
END $$;

CREATE OR REPLACE FUNCTION public.recrutamento_aval_responder(p_item uuid, p_opcao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cand uuid; _it public.recrutamento_avaliacao_itens; _av public.recrutamento_avaliacoes; _cfg public.recrutamento_aval_config; _pts int;
BEGIN
  _cand := public._rec_cand_atual();
  IF _cand IS NULL THEN RAISE EXCEPTION 'Perfil de candidato não encontrado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO _cfg FROM public.recrutamento_aval_config;
  SELECT i.* INTO _it FROM public.recrutamento_avaliacao_itens i JOIN public.recrutamento_avaliacoes a ON a.id=i.avaliacao_id
    WHERE i.id=p_item AND a.candidato_id=_cand FOR UPDATE OF i;
  IF _it.id IS NULL THEN RAISE EXCEPTION 'Pergunta não encontrada.' USING ERRCODE='42501'; END IF;
  SELECT * INTO _av FROM public.recrutamento_avaliacoes WHERE id=_it.avaliacao_id;
  IF _it.pontos IS NOT NULL THEN
    -- idempotente: reenvio da mesma resposta não altera nada
    IF _it.resposta IS NOT DISTINCT FROM p_opcao THEN RETURN jsonb_build_object('ok', true, 'repetida', true); END IF;
    RAISE EXCEPTION 'Esta pergunta já foi respondida ou o tempo terminou.' USING ERRCODE='P0001';
  END IF;
  IF _av.status <> 'em_andamento' OR _it.liberada_em IS NULL THEN RAISE EXCEPTION 'Pergunta indisponível.' USING ERRCODE='P0001'; END IF;
  IF NOT (p_opcao = ANY(_it.ordem_opcoes)) THEN RAISE EXCEPTION 'Alternativa inválida.' USING ERRCODE='22023'; END IF;
  IF now() > _it.prazo_em + make_interval(secs => _cfg.tolerancia_segundos) THEN
    UPDATE public.recrutamento_avaliacao_itens SET expirada=true, pontos=0 WHERE id=_it.id;
    PERFORM public._rec_aval_finalizar(_av.id);
    RETURN jsonb_build_object('ok', false, 'expirada', true);
  END IF;
  SELECT (o->>'pontos')::int INTO _pts FROM public.recrutamento_questoes q, jsonb_array_elements(q.opcoes) o
    WHERE q.id=_it.questao_id AND o->>'id'=p_opcao;
  UPDATE public.recrutamento_avaliacao_itens SET resposta=p_opcao, respondida_em=now(), pontos=coalesce(_pts,0) WHERE id=_it.id;
  PERFORM public._rec_aval_finalizar(_av.id);
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.recrutamento_aval_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recrutamento_aval_iniciar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recrutamento_aval_atual() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recrutamento_aval_responder(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_aval_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recrutamento_aval_iniciar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recrutamento_aval_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recrutamento_aval_responder(uuid, text) TO authenticated;
