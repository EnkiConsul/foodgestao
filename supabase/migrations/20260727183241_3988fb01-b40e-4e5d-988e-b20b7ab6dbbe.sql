DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dp_convocacao_status') THEN
    CREATE TYPE public.dp_convocacao_status AS ENUM ('pendente','aceita','recusada','cancelada','expirada');
  END IF;
END $$;

ALTER TYPE public.dp_escala_item_origem ADD VALUE IF NOT EXISTS 'convocacao';

CREATE TABLE IF NOT EXISTS public.dp_convocacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  turno_id uuid REFERENCES public.dp_turnos(id) ON DELETE SET NULL,
  escala_item_id uuid REFERENCES public.dp_escala_itens(id) ON DELETE SET NULL,
  data date NOT NULL,
  entrada time NOT NULL,
  saida time NOT NULL,
  intervalo_minutos integer NOT NULL DEFAULT 0,
  termina_no_dia_seguinte boolean NOT NULL DEFAULT false,
  carga_prevista_horas numeric NOT NULL DEFAULT 0,
  status public.dp_convocacao_status NOT NULL DEFAULT 'pendente',
  prazo_resposta timestamptz,
  enviada_em timestamptz NOT NULL DEFAULT now(),
  respondida_em timestamptz,
  motivo_recusa text,
  observacao text,
  criada_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dp_convocacoes_company_data ON public.dp_convocacoes (company_id, data);
CREATE INDEX IF NOT EXISTS idx_dp_convocacoes_colab ON public.dp_convocacoes (colaborador_id, data);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dp_convocacoes_ativa
  ON public.dp_convocacoes (colaborador_id, data)
  WHERE status IN ('pendente','aceita');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_convocacoes TO authenticated;
GRANT ALL ON public.dp_convocacoes TO service_role;

ALTER TABLE public.dp_convocacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_convocacoes_admin_all" ON public.dp_convocacoes
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_convocacoes_read_self" ON public.dp_convocacoes FOR SELECT
  TO authenticated
  USING (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  );

CREATE POLICY "dp_convocacoes_respond_self" ON public.dp_convocacoes FOR UPDATE
  TO authenticated
  USING (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
    AND status = 'pendente'
  )
  WITH CHECK (
    public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
    AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
    AND status IN ('aceita','recusada')
  );

CREATE TRIGGER trg_dp_convocacoes_updated_at
  BEFORE UPDATE ON public.dp_convocacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE OR REPLACE FUNCTION public.dp_convocacao_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regime public.dp_regime_trabalho;
BEGIN
  SELECT regime INTO v_regime FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_regime IS DISTINCT FROM 'intermitente' THEN
    RAISE EXCEPTION 'Convocações são exclusivas de colaboradores com contrato intermitente.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('aceita','recusada') THEN
    NEW.respondida_em := COALESCE(NEW.respondida_em, now());
    IF OLD.prazo_resposta IS NOT NULL AND now() > OLD.prazo_resposta THEN
      RAISE EXCEPTION 'O prazo para responder esta convocação já expirou.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_dp_convocacao_guard
  BEFORE INSERT OR UPDATE ON public.dp_convocacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_convocacao_guard();