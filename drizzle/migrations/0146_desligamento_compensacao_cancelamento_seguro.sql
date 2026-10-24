DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('public.dp_desligamento_banco_aplicar(uuid,jsonb)'::regprocedure), '''banco_horas_desligamento''', '''excecao_gestor''');
 EXECUTE replace(pg_get_functiondef('public.dp_desligamento_banco_proteger()'::regprocedure), 'IF NEW.desligamento_processo_id IS NOT NULL THEN', 'IF NEW.desligamento_processo_id IS NOT NULL AND NEW.status <> ''cancelada'' THEN');
END $$;
REVOKE ALL ON FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dp_desligamento_banco_proteger() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_banco_aplicar(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_desligamento_banco_proteger() TO service_role;