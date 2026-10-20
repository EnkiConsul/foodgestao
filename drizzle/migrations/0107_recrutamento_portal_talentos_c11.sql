-- Etapa C1.1: Portal de Carreiras e vínculo candidato↔empresa (Banco de Talentos).
-- Rollback: DROP das funções recrutamento_portal_*, recrutamento_talento_*, recrutamento_banco_geral_definir,
-- recrutamento_minhas_participacoes; gatilho recrutamento_candidatos_banco_geral; tabelas recrutamento_consentimentos,
-- recrutamento_talentos, recrutamento_portais; colunas banco_geral_em/banco_geral_versao (dados de candidatos preservados).

CREATE TABLE public.recrutamento_portais (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (char_length(slug) BETWEEN 3 AND 40 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome_publico text CHECK (char_length(nome_publico) <= 80),
  apresentacao text CHECK (char_length(apresentacao) <= 600),
  regiao text CHECK (char_length(regiao) <= 80),
  logo_url text CHECK (logo_url IS NULL OR (char_length(logo_url) <= 500 AND logo_url ~ '^https://')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.recrutamento_portais TO authenticated;
GRANT ALL ON public.recrutamento_portais TO service_role;
ALTER TABLE public.recrutamento_portais ENABLE ROW LEVEL SECURITY;
CREATE POLICY rec_portal_select ON public.recrutamento_portais FOR SELECT TO authenticated USING (public.recrutamento_pode_gerir(company_id));
CREATE POLICY rec_portal_update ON public.recrutamento_portais FOR UPDATE TO authenticated
  USING (public.recrutamento_pode_gerir(company_id)) WITH CHECK (public.recrutamento_pode_gerir(company_id));

CREATE OR REPLACE FUNCTION public.recrutamento_portais_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'service_role' AND (NEW.slug <> OLD.slug OR NEW.company_id <> OLD.company_id) THEN
    RAISE EXCEPTION 'O link do portal é permanente.' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER recrutamento_portais_guard BEFORE UPDATE ON public.recrutamento_portais
  FOR EACH ROW EXECUTE FUNCTION public.recrutamento_portais_guard();

INSERT INTO public.recrutamento_portais (company_id, slug, nome_publico, regiao)
SELECT l.company_id, 'pakere', 'Pakerê Pizzaria', 'Goiânia e Aparecida de Goiânia (GO)'
FROM public.recrutamento_liberacoes l WHERE l.company_id = 'b0d450a7-0a70-4322-bcdb-c3abfea196ba'
ON CONFLICT DO NOTHING;

CREATE TABLE public.recrutamento_talentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidato_id uuid NOT NULL REFERENCES public.recrutamento_candidatos(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('portal','vaga')),
  estado text NOT NULL DEFAULT 'ativo' CHECK (estado IN ('ativo','retirado')),
  texto_versao int NOT NULL,
  autorizado_em timestamptz NOT NULL DEFAULT now(),
  retirado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, candidato_id)
);
CREATE INDEX recrutamento_talentos_company_idx ON public.recrutamento_talentos(company_id, estado);
CREATE INDEX recrutamento_talentos_cand_idx ON public.recrutamento_talentos(candidato_id);
GRANT SELECT ON public.recrutamento_talentos TO authenticated;
GRANT ALL ON public.recrutamento_talentos TO service_role;
ALTER TABLE public.recrutamento_talentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rec_talentos_select_proprio ON public.recrutamento_talentos FOR SELECT TO authenticated
  USING (candidato_id IN (SELECT c.id FROM public.recrutamento_candidatos c WHERE c.user_id = auth.uid()));

-- Histórico mínimo de decisões (empresa específica ou Banco Geral). Sem dados pessoais.
CREATE TABLE public.recrutamento_consentimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.recrutamento_candidatos(id) ON DELETE CASCADE,
  escopo text NOT NULL CHECK (escopo IN ('empresa','geral')),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  acao text NOT NULL CHECK (acao IN ('autorizou','retirou')),
  finalidade text NOT NULL,
  texto_versao int NOT NULL,
  origem text NOT NULL CHECK (origem IN ('portal','perfil','vaga')),
  em timestamptz NOT NULL DEFAULT now(),
  CHECK ((escopo = 'empresa') = (company_id IS NOT NULL))
);
CREATE INDEX recrutamento_consent_cand_idx ON public.recrutamento_consentimentos(candidato_id, em DESC);
GRANT ALL ON public.recrutamento_consentimentos TO service_role;
ALTER TABLE public.recrutamento_consentimentos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recrutamento_candidatos ADD COLUMN banco_geral_em timestamptz, ADD COLUMN banco_geral_versao int;

-- Banco Geral só muda pelas funções de consentimento (registra versão e data).
CREATE OR REPLACE FUNCTION public.recrutamento_candidatos_banco_geral_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user <> 'service_role' AND coalesce(current_setting('recrutamento.rpc', true),'') <> '1'
     AND (NEW.visivel_empresas IS DISTINCT FROM OLD.visivel_empresas
          OR NEW.banco_geral_em IS DISTINCT FROM OLD.banco_geral_em
          OR NEW.banco_geral_versao IS DISTINCT FROM OLD.banco_geral_versao) THEN
    RAISE EXCEPTION 'Use as opções de autorização do perfil.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER recrutamento_candidatos_banco_geral BEFORE UPDATE ON public.recrutamento_candidatos
  FOR EACH ROW EXECUTE FUNCTION public.recrutamento_candidatos_banco_geral_guard();

CREATE OR REPLACE FUNCTION public._rec_texto_versao() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;

CREATE OR REPLACE FUNCTION public._rec_aval_valida(_cand uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM recrutamento_avaliacoes a WHERE a.candidato_id = _cand AND a.status = 'concluida'
                 AND a.tipo = 'completa' AND a.valida_ate > now()) $$;
REVOKE ALL ON FUNCTION public._rec_aval_valida(uuid) FROM PUBLIC, anon, authenticated;

-- Portal público: só dados autorizados da empresa e das vagas abertas.
CREATE OR REPLACE FUNCTION public.recrutamento_portal_publico(_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'slug', p.slug,
    'empresa', coalesce(nullif(p.nome_publico,''), nullif(c.trade_name,''), c.name),
    'apresentacao', p.apresentacao, 'regiao', p.regiao, 'logo_url', p.logo_url,
    'vagas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'codigo', v.codigo, 'titulo', v.titulo, 'quantidade', v.quantidade, 'unidade', u.nome,
        'cidade', coalesce(v.cidade, u.cidade), 'bairro', v.bairro, 'tipo_contratacao', v.tipo_contratacao,
        'jornada', v.jornada) ORDER BY v.publicada_em DESC)
      FROM recrutamento_vagas v LEFT JOIN dp_unidades u ON u.id = v.unidade_id
      WHERE v.company_id = p.company_id AND v.status = 'ativa' AND v.expira_em > now()), '[]'::jsonb))
  FROM recrutamento_portais p
  JOIN companies c ON c.id = p.company_id
  WHERE p.slug = lower(trim(_slug)) AND p.ativo
    AND EXISTS (SELECT 1 FROM recrutamento_liberacoes l WHERE l.company_id = p.company_id);
$$;
REVOKE ALL ON FUNCTION public.recrutamento_portal_publico(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recrutamento_portal_publico(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._rec_portal_company(_slug text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.company_id FROM recrutamento_portais p
  WHERE p.slug = lower(trim(_slug)) AND p.ativo
    AND EXISTS (SELECT 1 FROM recrutamento_liberacoes l WHERE l.company_id = p.company_id) $$;
REVOKE ALL ON FUNCTION public._rec_portal_company(text) FROM PUBLIC, anon, authenticated;

-- Situação do candidato logado em relação ao portal (empresa resolvida pelo link, nunca pelo navegador).
CREATE OR REPLACE FUNCTION public.recrutamento_talento_status(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _co uuid; _c recrutamento_candidatos; _t recrutamento_talentos;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
  _co := _rec_portal_company(_slug);
  IF _co IS NULL THEN RAISE EXCEPTION 'Portal não encontrado.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO _c FROM recrutamento_candidatos WHERE user_id = auth.uid();
  IF _c.id IS NULL THEN RETURN jsonb_build_object('tem_perfil', false); END IF;
  SELECT * INTO _t FROM recrutamento_talentos WHERE company_id = _co AND candidato_id = _c.id;
  RETURN jsonb_build_object(
    'tem_perfil', true,
    'perfil_completo', coalesce(array_length(_c.areas,1),0) > 0,
    'avaliacao_valida', _rec_aval_valida(_c.id),
    'vinculo', CASE WHEN _t.id IS NULL THEN NULL ELSE _t.estado END,
    'autorizado_em', _t.autorizado_em,
    'banco_geral', _c.visivel_empresas,
    'texto_versao', _rec_texto_versao());
END $$;
REVOKE ALL ON FUNCTION public.recrutamento_talento_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_talento_status(text) TO authenticated;

-- Entrada no Banco de Talentos da empresa (idempotente, atômica).
CREATE OR REPLACE FUNCTION public.recrutamento_talento_entrar(_slug text, _banco_geral boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _co uuid; _c recrutamento_candidatos; _t recrutamento_talentos; _v int := _rec_texto_versao(); _res text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
  IF _banco_geral IS NULL THEN RAISE EXCEPTION 'Escolha uma das opções de autorização.' USING ERRCODE = '22023'; END IF;
  _co := _rec_portal_company(_slug);
  IF _co IS NULL THEN RAISE EXCEPTION 'Portal não encontrado.' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO _c FROM recrutamento_candidatos WHERE user_id = auth.uid() FOR UPDATE;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Crie seu perfil de candidato primeiro.' USING ERRCODE = '42501'; END IF;
  IF coalesce(array_length(_c.areas,1),0) = 0 THEN RAISE EXCEPTION 'Complete seu perfil profissional primeiro.' USING ERRCODE = '42501'; END IF;
  IF NOT _rec_aval_valida(_c.id) THEN RAISE EXCEPTION 'Conclua a Avaliação Food Service 360 primeiro.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO _t FROM recrutamento_talentos WHERE company_id = _co AND candidato_id = _c.id FOR UPDATE;
  IF _t.id IS NOT NULL AND _t.estado = 'ativo' THEN
    _res := 'ja_ativo';
  ELSE
    INSERT INTO recrutamento_talentos (company_id, candidato_id, origem, estado, texto_versao, autorizado_em)
    VALUES (_co, _c.id, 'portal', 'ativo', _v, now())
    ON CONFLICT (company_id, candidato_id) DO UPDATE
      SET estado = 'ativo', origem = 'portal', texto_versao = _v, autorizado_em = now(), retirado_em = NULL, updated_at = now();
    INSERT INTO recrutamento_consentimentos (candidato_id, escopo, company_id, acao, finalidade, texto_versao, origem)
    VALUES (_c.id, 'empresa', _co, 'autorizou', 'futuras oportunidades desta empresa', _v, 'portal');
    _res := 'ativado';
  END IF;

  IF _banco_geral AND NOT _c.visivel_empresas THEN
    PERFORM set_config('recrutamento.rpc','1', true);
    UPDATE recrutamento_candidatos SET visivel_empresas = true, banco_geral_em = now(), banco_geral_versao = _v WHERE id = _c.id;
    INSERT INTO recrutamento_consentimentos (candidato_id, escopo, acao, finalidade, texto_versao, origem)
    VALUES (_c.id, 'geral', 'autorizou', 'Banco Geral de Talentos AVETO', _v, 'portal');
  END IF;
  RETURN jsonb_build_object('resultado', _res);
END $$;
REVOKE ALL ON FUNCTION public.recrutamento_talento_entrar(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_talento_entrar(text, boolean) TO authenticated;

-- Candidato retira a participação de uma empresa (só a própria).
CREATE OR REPLACE FUNCTION public.recrutamento_talento_retirar(_talento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t recrutamento_talentos;
BEGIN
  SELECT t.* INTO _t FROM recrutamento_talentos t JOIN recrutamento_candidatos c ON c.id = t.candidato_id
   WHERE t.id = _talento_id AND c.user_id = auth.uid() FOR UPDATE OF t;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Participação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF _t.estado = 'retirado' THEN RETURN; END IF;
  UPDATE recrutamento_talentos SET estado = 'retirado', retirado_em = now(), updated_at = now() WHERE id = _t.id;
  INSERT INTO recrutamento_consentimentos (candidato_id, escopo, company_id, acao, finalidade, texto_versao, origem)
  VALUES (_t.candidato_id, 'empresa', _t.company_id, 'retirou', 'futuras oportunidades desta empresa', _rec_texto_versao(), 'perfil');
END $$;
REVOKE ALL ON FUNCTION public.recrutamento_talento_retirar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_talento_retirar(uuid) TO authenticated;

-- Liga/desliga o Banco Geral (independente das empresas).
CREATE OR REPLACE FUNCTION public.recrutamento_banco_geral_definir(_ativo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c recrutamento_candidatos; _v int := _rec_texto_versao();
BEGIN
  SELECT * INTO _c FROM recrutamento_candidatos WHERE user_id = auth.uid() FOR UPDATE;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado.' USING ERRCODE = '42501'; END IF;
  IF _ativo IS NULL OR _ativo = _c.visivel_empresas THEN RETURN; END IF;
  IF _ativo AND NOT _rec_aval_valida(_c.id) THEN RAISE EXCEPTION 'Conclua a Avaliação Food Service 360 primeiro.' USING ERRCODE = '42501'; END IF;
  PERFORM set_config('recrutamento.rpc','1', true);
  UPDATE recrutamento_candidatos SET visivel_empresas = _ativo,
    banco_geral_em = CASE WHEN _ativo THEN now() ELSE banco_geral_em END,
    banco_geral_versao = CASE WHEN _ativo THEN _v ELSE banco_geral_versao END WHERE id = _c.id;
  INSERT INTO recrutamento_consentimentos (candidato_id, escopo, acao, finalidade, texto_versao, origem)
  VALUES (_c.id, 'geral', CASE WHEN _ativo THEN 'autorizou' ELSE 'retirou' END, 'Banco Geral de Talentos AVETO', _v, 'perfil');
END $$;
REVOKE ALL ON FUNCTION public.recrutamento_banco_geral_definir(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_banco_geral_definir(boolean) TO authenticated;

-- Empresas às quais o candidato disponibilizou o perfil.
CREATE OR REPLACE FUNCTION public.recrutamento_minhas_participacoes()
RETURNS TABLE (id uuid, empresa text, slug text, estado text, autorizado_em timestamptz, retirado_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, coalesce(nullif(p.nome_publico,''), nullif(co.trade_name,''), co.name), p.slug, t.estado, t.autorizado_em, t.retirado_em
  FROM recrutamento_talentos t
  JOIN recrutamento_candidatos c ON c.id = t.candidato_id AND c.user_id = auth.uid()
  JOIN companies co ON co.id = t.company_id
  LEFT JOIN recrutamento_portais p ON p.company_id = t.company_id
  ORDER BY t.autorizado_em DESC $$;
REVOKE ALL ON FUNCTION public.recrutamento_minhas_participacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_minhas_participacoes() TO authenticated;