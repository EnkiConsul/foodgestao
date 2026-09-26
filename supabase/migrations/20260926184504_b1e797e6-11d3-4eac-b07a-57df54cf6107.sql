REVOKE ALL ON FUNCTION public.subscription_total_cents(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.subscription_total_cents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_total_cents(uuid) TO authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION unaccent SET SCHEMA extensions;

ALTER DATABASE postgres SET search_path = public, extensions;