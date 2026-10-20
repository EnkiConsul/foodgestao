
-- Recrutamento 360 — Entrega 1 (isolado; não altera Financeiro/Pessoas)
CREATE TABLE public.recrutamento_liberacoes (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  liberado_em timestamptz NOT NULL DEFAULT now(),
  observacao text
);
GRANT SELECT ON public.recrutamento_liberacoes TO authenticated;
GRANT ALL ON public.recrutamento_liberacoes TO service_role;
ALTER TABLE public.recrutamento_liberacoes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.recrutamento_pode_gerir(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM recrutamento_liberacoes l WHERE l.company_id = _company_id)
    AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = _company_id
                AND m.user_id = auth.uid() AND m.role IN ('owner','admin')
                AND coalesce(m.situacao,'ativo') = 'ativo');
$$;
REVOKE ALL ON FUNCTION public.recrutamento_pode_gerir(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_pode_gerir(uuid) TO authenticated;

CREATE POLICY rec_lib_select ON public.recrutamento_liberacoes FOR SELECT TO authenticated
  USING (public.recrutamento_pode_gerir(company_id));

CREATE TABLE public.recrutamento_vagas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  codigo text NOT NULL UNIQUE DEFAULT lower(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  titulo text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 120),
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade BETWEEN 1 AND 999),
  cidade text, bairro text,
  jornada text, escala text,
  tipo_contratacao text NOT NULL DEFAULT 'clt' CHECK (tipo_contratacao IN ('clt','intermitente','freelancer','temporario','estagio','pj')),
  remuneracao text, exibir_remuneracao boolean NOT NULL DEFAULT false,
  beneficios text, atividades text, requisitos text,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','ativa','pausada','encerrada')),
  publicada_em timestamptz, expira_em timestamptz, encerrada_em timestamptz,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recrutamento_vagas_company_idx ON public.recrutamento_vagas(company_id, status);
GRANT SELECT, INSERT, UPDATE ON public.recrutamento_vagas TO authenticated;
GRANT ALL ON public.recrutamento_vagas TO service_role;
ALTER TABLE public.recrutamento_vagas ENABLE ROW LEVEL SECURITY;
CREATE POLICY rec_vagas_select ON public.recrutamento_vagas FOR SELECT TO authenticated USING (public.recrutamento_pode_gerir(company_id));
CREATE POLICY rec_vagas_insert ON public.recrutamento_vagas FOR INSERT TO authenticated WITH CHECK (public.recrutamento_pode_gerir(company_id) AND status = 'rascunho');
CREATE POLICY rec_vagas_update ON public.recrutamento_vagas FOR UPDATE TO authenticated USING (public.recrutamento_pode_gerir(company_id)) WITH CHECK (public.recrutamento_pode_gerir(company_id));

-- Guarda: status/datas de publicação só mudam pelas RPCs; unidade deve ser da empresa
CREATE OR REPLACE FUNCTION public.recrutamento_vagas_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.unidade_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dp_unidades u WHERE u.id = NEW.unidade_id AND u.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Unidade não pertence à empresa';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    IF coalesce(current_setting('recrutamento.rpc', true),'') <> '1' THEN
      NEW.status := 'rascunho'; NEW.publicada_em := NULL; NEW.expira_em := NULL; NEW.encerrada_em := NULL;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.company_id <> OLD.company_id OR NEW.codigo <> OLD.codigo OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Campos imutáveis';
  END IF;
  IF coalesce(current_setting('recrutamento.rpc', true),'') <> '1' AND (
     NEW.status <> OLD.status OR NEW.publicada_em IS DISTINCT FROM OLD.publicada_em
     OR NEW.expira_em IS DISTINCT FROM OLD.expira_em OR NEW.encerrada_em IS DISTINCT FROM OLD.encerrada_em) THEN
    RAISE EXCEPTION 'Use as ações de publicar, pausar, renovar ou encerrar';
  END IF;
  IF OLD.status = 'encerrada' AND coalesce(current_setting('recrutamento.rpc', true),'') <> '1' THEN
    RAISE EXCEPTION 'Vaga encerrada não pode ser editada';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER recrutamento_vagas_guard BEFORE INSERT OR UPDATE ON public.recrutamento_vagas
  FOR EACH ROW EXECUTE FUNCTION public.recrutamento_vagas_guard();

-- Ação atômica de status (limite de 3 ativas não expiradas por empresa)
CREATE OR REPLACE FUNCTION public.recrutamento_vaga_acao(_vaga_id uuid, _acao text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v recrutamento_vagas; n int; expirada boolean;
BEGIN
  SELECT * INTO v FROM recrutamento_vagas WHERE id = _vaga_id;
  IF NOT FOUND OR NOT recrutamento_pode_gerir(v.company_id) THEN
    RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('recrutamento_vagas:' || v.company_id::text));
  SELECT * INTO v FROM recrutamento_vagas WHERE id = _vaga_id FOR UPDATE;
  expirada := v.status = 'ativa' AND v.expira_em <= now();
  PERFORM set_config('recrutamento.rpc','1', true);

  IF _acao IN ('publicar','renovar') THEN
    IF v.status = 'encerrada' THEN RAISE EXCEPTION 'Vaga encerrada não pode ser republicada'; END IF;
    IF _acao = 'renovar' AND v.status <> 'ativa' THEN RAISE EXCEPTION 'Só vagas ativas ou expiradas podem ser renovadas'; END IF;
    IF v.status <> 'ativa' OR expirada THEN
      SELECT count(*) INTO n FROM recrutamento_vagas
       WHERE company_id = v.company_id AND status = 'ativa' AND expira_em > now() AND id <> v.id;
      IF n >= 3 THEN
        RAISE EXCEPTION 'Limite de 3 vagas ativas atingido. Pause ou encerre outra vaga antes.' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    UPDATE recrutamento_vagas SET status = 'ativa',
      publicada_em = CASE WHEN v.status = 'ativa' AND NOT expirada THEN publicada_em ELSE now() END,
      expira_em = now() + interval '30 days'
     WHERE id = v.id;
  ELSIF _acao = 'pausar' THEN
    IF v.status <> 'ativa' THEN RAISE EXCEPTION 'Só vagas ativas podem ser pausadas'; END IF;
    UPDATE recrutamento_vagas SET status = 'pausada' WHERE id = v.id;
  ELSIF _acao = 'encerrar' THEN
    UPDATE recrutamento_vagas SET status = 'encerrada', encerrada_em = now() WHERE id = v.id;
  ELSE
    RAISE EXCEPTION 'Ação inválida';
  END IF;
  SELECT * INTO v FROM recrutamento_vagas WHERE id = _vaga_id;
  RETURN to_jsonb(v);
END $$;
REVOKE ALL ON FUNCTION public.recrutamento_vaga_acao(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_vaga_acao(uuid, text) TO authenticated;

-- Leitura pública: só campos autorizados; nada de dados pessoais
CREATE OR REPLACE FUNCTION public.recrutamento_vaga_publica(_codigo text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object(
    'codigo', v.codigo, 'titulo', v.titulo, 'quantidade', v.quantidade,
    'empresa', coalesce(nullif(c.trade_name,''), c.name), 'unidade', u.nome,
    'cidade', coalesce(v.cidade, u.cidade), 'bairro', v.bairro,
    'jornada', v.jornada, 'escala', v.escala, 'tipo_contratacao', v.tipo_contratacao,
    'remuneracao', CASE WHEN v.exibir_remuneracao THEN v.remuneracao END,
    'beneficios', v.beneficios, 'atividades', v.atividades, 'requisitos', v.requisitos,
    'publicada_em', v.publicada_em, 'expira_em', v.expira_em,
    'estado', CASE WHEN v.status = 'ativa' AND v.expira_em > now() THEN 'ativa'
                   WHEN v.status = 'ativa' THEN 'expirada' ELSE v.status END,
    'candidaturas_abertas', false
  ) END
  FROM (SELECT 1) d
  LEFT JOIN recrutamento_vagas v ON v.codigo = lower(trim(_codigo)) AND v.status <> 'rascunho'
       AND EXISTS (SELECT 1 FROM recrutamento_liberacoes l WHERE l.company_id = v.company_id)
  LEFT JOIN companies c ON c.id = v.company_id
  LEFT JOIN dp_unidades u ON u.id = v.unidade_id;
$$;
REVOKE ALL ON FUNCTION public.recrutamento_vaga_publica(text) FROM public;
GRANT EXECUTE ON FUNCTION public.recrutamento_vaga_publica(text) TO anon, authenticated;

-- Empresas que o usuário pode gerir no Recrutamento (para menu/hub)
CREATE OR REPLACE FUNCTION public.recrutamento_minhas_empresas()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.company_id FROM recrutamento_liberacoes l WHERE recrutamento_pode_gerir(l.company_id);
$$;
REVOKE ALL ON FUNCTION public.recrutamento_minhas_empresas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recrutamento_minhas_empresas() TO authenticated;
