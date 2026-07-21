-- Remove tabelas de controle antigas (nunca usadas em produção)
DROP TABLE IF EXISTS public.dp_import_logs CASCADE;
DROP TABLE IF EXISTS public.dp_import_id_map CASCADE;
DROP TABLE IF EXISTS public.dp_import_runs CASCADE;

-- Tabelas de controle da migração legada Pakere -> 360°FOOD DP
CREATE TABLE public.dp_legacy_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  source_project text NOT NULL DEFAULT 'pakere',
  status text NOT NULL DEFAULT 'pending',
  dry_run boolean NOT NULL DEFAULT true,
  copy_storage boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  finished_at timestamptz,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  skipped_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dp_legacy_import_runs TO service_role;
ALTER TABLE public.dp_legacy_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins podem ver runs legadas"
  ON public.dp_legacy_import_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE public.dp_legacy_import_id_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES public.dp_legacy_import_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  source_table text NOT NULL,
  source_id text NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, source_table, source_id, target_table)
);
CREATE INDEX ON public.dp_legacy_import_id_map (import_run_id);
CREATE INDEX ON public.dp_legacy_import_id_map (target_table, target_id);
GRANT ALL ON public.dp_legacy_import_id_map TO service_role;
ALTER TABLE public.dp_legacy_import_id_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins podem ver mapa legado"
  ON public.dp_legacy_import_id_map FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TABLE public.dp_legacy_import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_run_id uuid NOT NULL REFERENCES public.dp_legacy_import_runs(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id text,
  error_code text,
  error_message text NOT NULL,
  source_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.dp_legacy_import_errors (import_run_id);
GRANT ALL ON public.dp_legacy_import_errors TO service_role;
ALTER TABLE public.dp_legacy_import_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins podem ver erros legados"
  ON public.dp_legacy_import_errors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));