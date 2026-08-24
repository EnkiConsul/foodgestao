-- M2b (Convocações 3A.1) — Chaves candidatas compostas para viabilizar composite FKs de integridade multiempresa.
-- Evidência: dp_unidades 5/5, dp_cargos 5/5, dp_turnos 5/5, dp_colaboradores 14/14 com company_id NOT NULL; ids distintos = total.
-- Rollback: ALTER TABLE ... DROP CONSTRAINT uq_<tabela>_id_company;

ALTER TABLE public.dp_unidades      ADD CONSTRAINT uq_dp_unidades_id_company      UNIQUE (id, company_id);
ALTER TABLE public.dp_cargos        ADD CONSTRAINT uq_dp_cargos_id_company        UNIQUE (id, company_id);
ALTER TABLE public.dp_turnos        ADD CONSTRAINT uq_dp_turnos_id_company        UNIQUE (id, company_id);
ALTER TABLE public.dp_colaboradores ADD CONSTRAINT uq_dp_colaboradores_id_company UNIQUE (id, company_id);