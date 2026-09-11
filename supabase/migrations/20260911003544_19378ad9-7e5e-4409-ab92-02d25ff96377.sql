REVOKE EXECUTE ON FUNCTION public.app_error_log_record(text,text,uuid,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_error_log_record(text,text,uuid,text,text,text,text,text,text,text,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.app_error_log_record(text,text,uuid,text,text,text,text,text,text,text,jsonb) TO authenticated, service_role;