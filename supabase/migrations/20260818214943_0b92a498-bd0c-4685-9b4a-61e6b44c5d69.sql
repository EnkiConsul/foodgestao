-- 1) Regras de adicional por tempo de serviço (anuênio/triênio/quinquênio)
CREATE TABLE public.dp_adicionais_tempo_servico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Adicional por tempo de serviço',
  escopo text NOT NULL DEFAULT 'empresa',
  sindicato_id uuid REFERENCES public.dp_sindicatos(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  ciclo_meses integer NOT NULL DEFAULT 36,
  percentual_por_ciclo numeric(6,3) NOT NULL DEFAULT 0,
  base text NOT NULL DEFAULT 'salario_base',
  max_ciclos integer,
  acumula boolean NOT NULL DEFAULT true,
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_adic_ts_escopo_chk CHECK (escopo IN ('empresa','sindicato','unidade','cargo')),
  CONSTRAINT dp_adic_ts_base_chk CHECK (base IN ('salario_base','piso_cargo')),
  CONSTRAINT dp_adic_ts_ciclo_chk CHECK (ciclo_meses BETWEEN 1 AND 240),
  CONSTRAINT dp_adic_ts_perc_chk CHECK (percentual_por_ciclo >= 0 AND percentual_por_ciclo <= 100),
  CONSTRAINT dp_adic_ts_vig_chk CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE INDEX dp_adic_ts_company_idx ON public.dp_adicionais_tempo_servico(company_id, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_adicionais_tempo_servico TO authenticated;
GRANT ALL ON public.dp_adicionais_tempo_servico TO service_role;

ALTER TABLE public.dp_adicionais_tempo_servico ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_adic_ts_select_members ON public.dp_adicionais_tempo_servico
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY dp_adic_ts_write_admin ON public.dp_adicionais_tempo_servico
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE TRIGGER dp_adic_ts_updated_at BEFORE UPDATE ON public.dp_adicionais_tempo_servico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Dependentes do colaborador (IRRF e salário-família)
CREATE TABLE public.dp_dependentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_nascimento date,
  parentesco text NOT NULL DEFAULT 'filho',
  cpf text,
  deficiencia boolean NOT NULL DEFAULT false,
  laudo_validade date,
  conta_irrf boolean NOT NULL DEFAULT true,
  conta_salario_familia boolean NOT NULL DEFAULT true,
  vacinacao_em date,
  frequencia_escolar_em date,
  cessado_em date,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_dependentes_parentesco_chk CHECK (parentesco IN ('filho','enteado','tutelado','conjuge','outro'))
);

CREATE INDEX dp_dependentes_colab_idx ON public.dp_dependentes(colaborador_id);
CREATE INDEX dp_dependentes_company_idx ON public.dp_dependentes(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_dependentes TO authenticated;
GRANT ALL ON public.dp_dependentes TO service_role;

ALTER TABLE public.dp_dependentes ENABLE ROW LEVEL SECURITY;

-- Dado sensível de RH: só admin/owner da empresa e o próprio colaborador leem.
CREATE POLICY dp_dependentes_admin_all ON public.dp_dependentes
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_dependentes_self_read ON public.dp_dependentes
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_of((SELECT auth.uid())));

-- Guarda de tenant: dependente sempre na mesma empresa do colaborador.
CREATE OR REPLACE FUNCTION public.dp_dependentes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NEW.company_id IS NULL THEN NEW.company_id := v_company; END IF;
  IF NEW.company_id <> v_company THEN
    RAISE EXCEPTION 'Dependente deve pertencer à mesma empresa do colaborador';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_dependentes_guard_trg BEFORE INSERT OR UPDATE ON public.dp_dependentes
  FOR EACH ROW EXECUTE FUNCTION public.dp_dependentes_guard();

CREATE TRIGGER dp_dependentes_updated_at BEFORE UPDATE ON public.dp_dependentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contagem de dependentes do IRRF passa a vir da lista cadastrada.
CREATE OR REPLACE FUNCTION public.dp_dependentes_sync_irrf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_colab uuid; v_qtd int;
BEGIN
  v_colab := COALESCE(NEW.colaborador_id, OLD.colaborador_id);
  SELECT count(*) INTO v_qtd
    FROM public.dp_dependentes d
   WHERE d.colaborador_id = v_colab
     AND d.conta_irrf = true
     AND d.cessado_em IS NULL;
  UPDATE public.dp_colaboradores SET dependentes_irrf = v_qtd WHERE id = v_colab;
  RETURN NULL;
END;
$$;

CREATE TRIGGER dp_dependentes_sync_irrf_trg AFTER INSERT OR UPDATE OR DELETE ON public.dp_dependentes
  FOR EACH ROW EXECUTE FUNCTION public.dp_dependentes_sync_irrf();

-- 3) Configuração anual do salário-família e liga/desliga do adicional
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS salario_familia_cota numeric(12,2),
  ADD COLUMN IF NOT EXISTS salario_familia_teto numeric(12,2),
  ADD COLUMN IF NOT EXISTS salario_familia_vigencia date,
  ADD COLUMN IF NOT EXISTS salario_familia_confirmado_em date,
  ADD COLUMN IF NOT EXISTS adicional_tempo_servico_ativo boolean NOT NULL DEFAULT false;

-- 4) Override manual do adicional por colaborador
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS adicional_tempo_servico_manual numeric(12,2),
  ADD COLUMN IF NOT EXISTS adicional_tempo_servico_override boolean NOT NULL DEFAULT false;