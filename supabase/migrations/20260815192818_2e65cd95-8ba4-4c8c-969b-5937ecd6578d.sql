-- 1) Catálogo de benefícios: periodicidade e regra de desconto
ALTER TABLE public.dp_beneficios
  ADD COLUMN IF NOT EXISTS periodicidade text NOT NULL DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS dias_base integer NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS desconto_tipo text NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS desconto_valor_fixo numeric NOT NULL DEFAULT 0;

ALTER TABLE public.dp_beneficios
  DROP CONSTRAINT IF EXISTS dp_beneficios_periodicidade_check,
  DROP CONSTRAINT IF EXISTS dp_beneficios_desconto_tipo_check;

ALTER TABLE public.dp_beneficios
  ADD CONSTRAINT dp_beneficios_periodicidade_check
    CHECK (periodicidade IN ('diario', 'mensal')),
  ADD CONSTRAINT dp_beneficios_desconto_tipo_check
    CHECK (desconto_tipo IN ('nenhum', 'percentual', 'valor'));

-- 2) Ficha de benefícios do colaborador: desconto e dispensa formal
ALTER TABLE public.dp_colaborador_beneficios
  ADD COLUMN IF NOT EXISTS desconto_tipo text NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS desconto_percentual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispensado_pelo_colaborador boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispensa_motivo text,
  ADD COLUMN IF NOT EXISTS termo_gerado_em timestamptz;

ALTER TABLE public.dp_colaborador_beneficios
  DROP CONSTRAINT IF EXISTS dp_colab_beneficios_desconto_tipo_check;

ALTER TABLE public.dp_colaborador_beneficios
  ADD CONSTRAINT dp_colab_beneficios_desconto_tipo_check
    CHECK (desconto_tipo IN ('nenhum', 'percentual', 'valor'));

-- 3) Colaborador: assiduidade percentual e vale-alimentação
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS premio_assiduidade_tipo text NOT NULL DEFAULT 'valor',
  ADD COLUMN IF NOT EXISTS vale_alimentacao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vale_alimentacao_valor numeric,
  ADD COLUMN IF NOT EXISTS vale_alimentacao_periodicidade text NOT NULL DEFAULT 'mensal',
  ADD COLUMN IF NOT EXISTS vale_alimentacao_dias_base integer NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS vale_alimentacao_desconto_tipo text NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS vale_alimentacao_desconto_valor numeric NOT NULL DEFAULT 0;

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_premio_tipo_check,
  DROP CONSTRAINT IF EXISTS dp_colaboradores_va_periodicidade_check,
  DROP CONSTRAINT IF EXISTS dp_colaboradores_va_desconto_tipo_check;

ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_premio_tipo_check
    CHECK (premio_assiduidade_tipo IN ('valor', 'percentual')),
  ADD CONSTRAINT dp_colaboradores_va_periodicidade_check
    CHECK (vale_alimentacao_periodicidade IN ('diario', 'mensal')),
  ADD CONSTRAINT dp_colaboradores_va_desconto_tipo_check
    CHECK (vale_alimentacao_desconto_tipo IN ('nenhum', 'percentual', 'valor'));

-- 4) Sindicato: um cargo, numa unidade, não pode ter dois sindicatos do mesmo tipo
CREATE OR REPLACE FUNCTION public.dp_sindicato_conflitos(
  _cargo_id uuid,
  _unidade_id uuid,
  _tipo public.dp_sindicato_tipo,
  _sindicato_id uuid DEFAULT NULL
)
RETURNS TABLE (sindicato_id uuid, sindicato_nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.nome
  FROM public.dp_sindicatos s
  JOIN public.dp_sindicato_cargos sc ON sc.sindicato_id = s.id
  JOIN public.dp_sindicato_unidades su ON su.sindicato_id = s.id
  WHERE s.tipo = _tipo
    AND s.ativo
    AND sc.cargo_id = _cargo_id
    AND su.unidade_id = _unidade_id
    AND (_sindicato_id IS NULL OR s.id <> _sindicato_id)
$$;

CREATE OR REPLACE FUNCTION public.dp_sindicato_vinculo_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo public.dp_sindicato_tipo;
  v_conflito text;
BEGIN
  SELECT tipo INTO v_tipo FROM public.dp_sindicatos WHERE id = NEW.sindicato_id;
  IF v_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'dp_sindicato_cargos' THEN
    SELECT string_agg(c.sindicato_nome, ', ') INTO v_conflito
    FROM public.dp_sindicato_unidades su
    CROSS JOIN LATERAL public.dp_sindicato_conflitos(
      NEW.cargo_id, su.unidade_id, v_tipo, NEW.sindicato_id
    ) c
    WHERE su.sindicato_id = NEW.sindicato_id;
  ELSE
    SELECT string_agg(c.sindicato_nome, ', ') INTO v_conflito
    FROM public.dp_sindicato_cargos sc
    CROSS JOIN LATERAL public.dp_sindicato_conflitos(
      sc.cargo_id, NEW.unidade_id, v_tipo, NEW.sindicato_id
    ) c
    WHERE sc.sindicato_id = NEW.sindicato_id;
  END IF;

  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION
      'Este cargo já está vinculado a outro sindicato % nesta unidade (%). Ajuste o vínculo existente antes de continuar.',
      v_tipo, v_conflito;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_sindicato_cargos_guard ON public.dp_sindicato_cargos;
CREATE TRIGGER trg_dp_sindicato_cargos_guard
  BEFORE INSERT OR UPDATE ON public.dp_sindicato_cargos
  FOR EACH ROW EXECUTE FUNCTION public.dp_sindicato_vinculo_guard();

DROP TRIGGER IF EXISTS trg_dp_sindicato_unidades_guard ON public.dp_sindicato_unidades;
CREATE TRIGGER trg_dp_sindicato_unidades_guard
  BEFORE INSERT OR UPDATE ON public.dp_sindicato_unidades
  FOR EACH ROW EXECUTE FUNCTION public.dp_sindicato_vinculo_guard();