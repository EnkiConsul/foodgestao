CREATE TYPE public.dp_ponto_tipo AS ENUM ('entrada','intervalo_inicio','intervalo_fim','saida');
CREATE TYPE public.dp_ponto_origem AS ENUM ('portal','admin','importado');

CREATE TABLE public.dp_pontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  data date NOT NULL,
  tipo public.dp_ponto_tipo NOT NULL,
  registrado_em timestamptz NOT NULL DEFAULT now(),
  origem public.dp_ponto_origem NOT NULL DEFAULT 'portal',
  latitude numeric,
  longitude numeric,
  observacao text,
  registrado_por uuid,
  ajustado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, data, tipo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_pontos TO authenticated;
GRANT ALL ON public.dp_pontos TO service_role;

ALTER TABLE public.dp_pontos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_pontos_admin_all ON public.dp_pontos
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_pontos_read_self ON public.dp_pontos
  FOR SELECT TO authenticated
  USING (
    dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = dp_colaborador_ativo_of(auth.uid())
  );

CREATE POLICY dp_pontos_insert_self ON public.dp_pontos
  FOR INSERT TO authenticated
  WITH CHECK (
    dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = dp_colaborador_ativo_of(auth.uid())
    AND origem = 'portal'
    AND data >= (CURRENT_DATE - 1)
    AND data <= CURRENT_DATE
  );

CREATE INDEX idx_dp_pontos_colab_data ON public.dp_pontos (colaborador_id, data);
CREATE INDEX idx_dp_pontos_company_data ON public.dp_pontos (company_id, data);

CREATE TRIGGER trg_dp_pontos_updated_at
  BEFORE UPDATE ON public.dp_pontos
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE OR REPLACE FUNCTION public.dp_ponto_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_company IS NULL OR v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Colaborador não pertence à empresa informada.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_ponto_guard
  BEFORE INSERT OR UPDATE ON public.dp_pontos
  FOR EACH ROW EXECUTE FUNCTION public.dp_ponto_guard();