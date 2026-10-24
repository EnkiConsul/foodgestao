DO $migration$
DECLARE s text;
BEGIN
 s:=pg_get_functiondef('public.dp_preadmissao_sincronizar_rotina()'::regprocedure);
 IF position('replace(replace(a->>''salario'',''.'',''''),'','',''.'')::numeric' in s)=0 THEN RAISE EXCEPTION 'Definição de sincronização divergente'; END IF;
 s:=replace(s,'replace(replace(a->>''salario'',''.'',''''),'','',''.'')::numeric','(CASE WHEN position('','' in a->>''salario'')>0 THEN replace(replace(a->>''salario'',''.'',''''),'','',''.'') ELSE a->>''salario'' END)::numeric');
 EXECUTE s;
END $migration$;