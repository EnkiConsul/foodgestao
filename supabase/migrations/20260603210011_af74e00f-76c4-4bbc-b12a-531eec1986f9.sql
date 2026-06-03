GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;