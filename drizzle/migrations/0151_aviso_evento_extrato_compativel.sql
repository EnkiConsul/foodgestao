DO $$ DECLARE f text; BEGIN
 f:=pg_get_functiondef('public.dp_desligamento_extrato_sincronizar(uuid,jsonb)'::regprocedure);
 f:=replace(f,'''extrato_sincronizado'',''extrato:''','''revisao'',''extrato:''');
 EXECUTE f;
END $$;