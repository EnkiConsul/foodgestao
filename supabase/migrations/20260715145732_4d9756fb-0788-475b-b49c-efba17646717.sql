
CREATE TABLE public.cnpj_cache (
  cnpj TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cnpj_cache_cnpj_14digits CHECK (cnpj ~ '^[0-9]{14}$')
);

GRANT SELECT ON public.cnpj_cache TO authenticated;
GRANT ALL ON public.cnpj_cache TO service_role;

ALTER TABLE public.cnpj_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read CNPJ cache"
  ON public.cnpj_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_cnpj_cache_updated_at
  BEFORE UPDATE ON public.cnpj_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cnpj_cache_fetched_at ON public.cnpj_cache(fetched_at DESC);
