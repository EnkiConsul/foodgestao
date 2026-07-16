
-- =========================================================================
-- FASE 2 / ONDA 1 — Fundação de schema para paridade com portalcolaborador
-- =========================================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.dp_folga_tipo AS ENUM ('normal','extra','ferias','abono','licenca');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_folga_origem AS ENUM ('fixa_semana','sorteio','troca','solicitacao','admin_manual','ferias');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_folga_status AS ENUM ('agendada','cancelada','realizada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_bloqueio_regra_tipo AS ENUM ('fixa_anual','dinamica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================================
-- 2) dp_folgas  (E.1 #1)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dp_folgas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  data           date NOT NULL,
  tipo           public.dp_folga_tipo   NOT NULL DEFAULT 'normal',
  origem         public.dp_folga_origem NOT NULL DEFAULT 'admin_manual',
  status         public.dp_folga_status NOT NULL DEFAULT 'agendada',
  extra          boolean NOT NULL DEFAULT false,
  observacao     text,
  criado_por     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_folgas_unique_ativa
  ON public.dp_folgas (company_id, colaborador_id, data)
  WHERE status <> 'cancelada';

CREATE INDEX IF NOT EXISTS idx_dp_folgas_company_data
  ON public.dp_folgas (company_id, data);
CREATE INDEX IF NOT EXISTS idx_dp_folgas_colab
  ON public.dp_folgas (colaborador_id, data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folgas TO authenticated;
GRANT ALL ON public.dp_folgas TO service_role;

ALTER TABLE public.dp_folgas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_folgas_read_member" ON public.dp_folgas
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_folgas_admin_write" ON public.dp_folgas
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_folgas_upd BEFORE UPDATE ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 3) dp_folgas_canceladas  (para trocas atômicas / auditoria — E.1 #7)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dp_folgas_canceladas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  folga_id       uuid REFERENCES public.dp_folgas(id) ON DELETE SET NULL,
  data           date NOT NULL,
  motivo         text,
  origem_cancelamento text NOT NULL DEFAULT 'admin',
  cancelado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dp_folgas_canc_company
  ON public.dp_folgas_canceladas (company_id, data);
CREATE INDEX IF NOT EXISTS idx_dp_folgas_canc_colab
  ON public.dp_folgas_canceladas (colaborador_id, data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_folgas_canceladas TO authenticated;
GRANT ALL ON public.dp_folgas_canceladas TO service_role;

ALTER TABLE public.dp_folgas_canceladas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_folgas_canc_read" ON public.dp_folgas_canceladas
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_folgas_canc_admin_write" ON public.dp_folgas_canceladas
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

-- =========================================================================
-- 4) dp_dia_config  (limite de folgas por dia — E.1 #3)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dp_dia_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id     uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  data           date NOT NULL,
  limite_folgas  integer NOT NULL DEFAULT 0 CHECK (limite_folgas >= 0),
  observacao     text,
  criado_por     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_dia_config_unique
  ON public.dp_dia_config (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_dia_config TO authenticated;
GRANT ALL ON public.dp_dia_config TO service_role;

ALTER TABLE public.dp_dia_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_dia_config_read" ON public.dp_dia_config
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_dia_config_admin_write" ON public.dp_dia_config
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_dia_config_upd BEFORE UPDATE ON public.dp_dia_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5) dp_bloqueio_regras + dp_bloqueio_regra_unidades  (E.1 #3)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dp_bloqueio_regras (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  tipo         public.dp_bloqueio_regra_tipo NOT NULL,
  -- fixa_anual: usa (mes, dia) e ignora regra_json
  mes          smallint CHECK (mes BETWEEN 1 AND 12),
  dia          smallint CHECK (dia BETWEEN 1 AND 31),
  -- dinamica: regra_json ex: {"tipo":"pascoa_offset","offset":-2}
  regra_json   jsonb,
  ativo        boolean NOT NULL DEFAULT true,
  criado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'fixa_anual' AND mes IS NOT NULL AND dia IS NOT NULL) OR
    (tipo = 'dinamica'   AND regra_json IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dp_bloq_regras_company
  ON public.dp_bloqueio_regras (company_id, ativo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bloqueio_regras TO authenticated;
GRANT ALL ON public.dp_bloqueio_regras TO service_role;

ALTER TABLE public.dp_bloqueio_regras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_bloq_regras_read" ON public.dp_bloqueio_regras
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_bloq_regras_admin_write" ON public.dp_bloqueio_regras
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_bloq_regras_upd BEFORE UPDATE ON public.dp_bloqueio_regras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.dp_bloqueio_regra_unidades (
  regra_id   uuid NOT NULL REFERENCES public.dp_bloqueio_regras(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  PRIMARY KEY (regra_id, unidade_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bloqueio_regra_unidades TO authenticated;
GRANT ALL ON public.dp_bloqueio_regra_unidades TO service_role;

ALTER TABLE public.dp_bloqueio_regra_unidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_bloq_regra_unid_read" ON public.dp_bloqueio_regra_unidades
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_bloqueio_regras r
                 WHERE r.id = regra_id
                   AND private.is_company_member(auth.uid(), r.company_id)));

CREATE POLICY "dp_bloq_regra_unid_admin_write" ON public.dp_bloqueio_regra_unidades
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_bloqueio_regras r
                 WHERE r.id = regra_id
                   AND private.is_company_admin_or_owner(auth.uid(), r.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_bloqueio_regras r
                      WHERE r.id = regra_id
                        AND private.is_company_admin_or_owner(auth.uid(), r.company_id)));

-- =========================================================================
-- 6) dp_datas_bloqueadas  (datas concretas — E.1 #3)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dp_datas_bloqueadas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  data         date NOT NULL,
  motivo       text NOT NULL,
  regra_id     uuid REFERENCES public.dp_bloqueio_regras(id) ON DELETE SET NULL,
  unidade_id   uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  liberada_por_solicitacao uuid REFERENCES public.dp_solicitacoes(id) ON DELETE SET NULL,
  criado_por   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_datas_bloq_unique
  ON public.dp_datas_bloqueadas (company_id, data, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_datas_bloqueadas TO authenticated;
GRANT ALL ON public.dp_datas_bloqueadas TO service_role;

ALTER TABLE public.dp_datas_bloqueadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_datas_bloq_read" ON public.dp_datas_bloqueadas
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_datas_bloq_admin_write" ON public.dp_datas_bloqueadas
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE TRIGGER dp_datas_bloq_upd BEFORE UPDATE ON public.dp_datas_bloqueadas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 7) dp_prioridade_aniversario  (E.1 #5)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.dp_prioridade_aniversario (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  ano            smallint NOT NULL,
  mes            smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  prioridade     integer NOT NULL,
  aniversariante boolean NOT NULL DEFAULT false,
  gerado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_prio_aniv_unique
  ON public.dp_prioridade_aniversario (company_id, colaborador_id, ano, mes);
CREATE INDEX IF NOT EXISTS idx_dp_prio_aniv_lookup
  ON public.dp_prioridade_aniversario (company_id, ano, mes, prioridade);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_prioridade_aniversario TO authenticated;
GRANT ALL ON public.dp_prioridade_aniversario TO service_role;

ALTER TABLE public.dp_prioridade_aniversario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_prio_aniv_read" ON public.dp_prioridade_aniversario
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_prio_aniv_admin_write" ON public.dp_prioridade_aniversario
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

-- =========================================================================
-- 8) UNIQUE em dp_colaboradores(company_id, email_portal)  (E.1 #10)
--    (CPF já tem unique index.)
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS dp_colaboradores_company_email_portal_key
  ON public.dp_colaboradores (company_id, lower(email_portal))
  WHERE email_portal IS NOT NULL;
