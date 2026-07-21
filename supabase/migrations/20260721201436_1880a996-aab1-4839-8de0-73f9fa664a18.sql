
-- 1) dp_import_runs
CREATE TABLE public.dp_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_name text NOT NULL DEFAULT 'pakere',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','rolled_back')),
  dry_run boolean NOT NULL DEFAULT true,
  copy_storage boolean NOT NULL DEFAULT false,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  batch_size integer NOT NULL DEFAULT 200 CHECK (batch_size BETWEEN 50 AND 500),
  started_at timestamptz,
  finished_at timestamptz,
  started_by uuid,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  dest_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dp_import_runs TO authenticated;
GRANT ALL ON public.dp_import_runs TO service_role;

ALTER TABLE public.dp_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read import runs"
  ON public.dp_import_runs FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Lock parcial: apenas uma run 'running' por empresa
CREATE UNIQUE INDEX dp_import_runs_one_running_per_company
  ON public.dp_import_runs(company_id)
  WHERE status = 'running';

CREATE INDEX dp_import_runs_company_created_idx
  ON public.dp_import_runs(company_id, created_at DESC);

-- 2) dp_import_id_map
CREATE TABLE public.dp_import_id_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.dp_import_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity text NOT NULL,
  source_id text NOT NULL,
  dest_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, entity, source_id)
);

GRANT SELECT ON public.dp_import_id_map TO authenticated;
GRANT ALL ON public.dp_import_id_map TO service_role;

ALTER TABLE public.dp_import_id_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read id map"
  ON public.dp_import_id_map FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX dp_import_id_map_run_entity_idx
  ON public.dp_import_id_map(run_id, entity);

-- 3) dp_import_logs
CREATE TABLE public.dp_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.dp_import_runs(id) ON DELETE CASCADE,
  entity text NOT NULL,
  level text NOT NULL CHECK (level IN ('info','warn','error')),
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dp_import_logs TO authenticated;
GRANT ALL ON public.dp_import_logs TO service_role;

ALTER TABLE public.dp_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read import logs"
  ON public.dp_import_logs FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX dp_import_logs_run_created_idx
  ON public.dp_import_logs(run_id, created_at DESC);

-- updated_at trigger em dp_import_runs
CREATE TRIGGER dp_import_runs_set_updated_at
  BEFORE UPDATE ON public.dp_import_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
