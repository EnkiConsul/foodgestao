CREATE TYPE public.dp_ponto_ajuste_acao AS ENUM ('incluir', 'alterar', 'excluir');

CREATE TABLE public.dp_ponto_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  data date NOT NULL,
  tipo public.dp_ponto_tipo NOT NULL,
  acao public.dp_ponto_ajuste_acao NOT NULL DEFAULT 'incluir',
  hora_solicitada text,
  motivo text NOT NULL,
  status public.dp_aprovacao_status NOT NULL DEFAULT 'pendente',
  observacao_analise text,
  analisado_por uuid,
  analisado_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_ponto_ajustes_hora_chk CHECK (acao = 'excluir' OR hora_solicitada ~ '^[0-2][0-9]:[0-5][0-9]$')
);

CREATE INDEX idx_dp_ponto_ajustes_company_status ON public.dp_ponto_ajustes (company_id, status, data DESC);
CREATE INDEX idx_dp_ponto_ajustes_colab ON public.dp_ponto_ajustes (colaborador_id, data DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ponto_ajustes TO authenticated;
GRANT ALL ON public.dp_ponto_ajustes TO service_role;

ALTER TABLE public.dp_ponto_ajustes ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_ponto_ajustes_admin_all ON public.dp_ponto_ajustes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_ponto_ajustes_read_self ON public.dp_ponto_ajustes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  );

CREATE POLICY dp_ponto_ajustes_insert_self ON public.dp_ponto_ajustes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
    AND status = 'pendente'
    AND analisado_por IS NULL
  );

CREATE POLICY dp_ponto_ajustes_delete_self ON public.dp_ponto_ajustes
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
    AND status = 'pendente'
  );

CREATE TRIGGER trg_dp_ponto_ajustes_updated_at
  BEFORE UPDATE ON public.dp_ponto_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- Bloqueia solicitação em competência já fechada
CREATE OR REPLACE FUNCTION public.dp_ponto_ajuste_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.dp_ponto_fechamentos f
    WHERE f.colaborador_id = NEW.colaborador_id
      AND f.competencia = to_char(NEW.data, 'YYYY-MM')
  ) THEN
    RAISE EXCEPTION 'Competência já fechada para este colaborador.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_ponto_ajuste_guard
  BEFORE INSERT ON public.dp_ponto_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.dp_ponto_ajuste_guard();

-- Aplica o ajuste aprovado no espelho de ponto
CREATE OR REPLACE FUNCTION public.dp_ponto_ajuste_aplicar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF NEW.status = 'aprovado' AND OLD.status IS DISTINCT FROM 'aprovado' THEN
    IF NEW.acao = 'excluir' THEN
      DELETE FROM public.dp_pontos
      WHERE colaborador_id = NEW.colaborador_id AND data = NEW.data AND tipo = NEW.tipo;
    ELSE
      v_ts := (NEW.data::text || ' ' || NEW.hora_solicitada || ':00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
      INSERT INTO public.dp_pontos (company_id, colaborador_id, data, tipo, registrado_em, origem, observacao, ajustado_por)
      VALUES (NEW.company_id, NEW.colaborador_id, NEW.data, NEW.tipo, v_ts, 'admin',
              'Ajuste aprovado: ' || NEW.motivo, NEW.analisado_por)
      ON CONFLICT (colaborador_id, data, tipo)
      DO UPDATE SET registrado_em = EXCLUDED.registrado_em,
                    origem = 'admin',
                    observacao = EXCLUDED.observacao,
                    ajustado_por = EXCLUDED.ajustado_por;
    END IF;
    NEW.analisado_em := COALESCE(NEW.analisado_em, now());
  ELSIF NEW.status = 'recusado' AND OLD.status IS DISTINCT FROM 'recusado' THEN
    NEW.analisado_em := COALESCE(NEW.analisado_em, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_ponto_ajuste_aplicar
  BEFORE UPDATE ON public.dp_ponto_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.dp_ponto_ajuste_aplicar();