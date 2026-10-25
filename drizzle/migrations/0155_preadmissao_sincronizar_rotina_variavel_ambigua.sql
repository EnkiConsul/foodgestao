DO $migration$
DECLARE s text;
BEGIN
 s:=pg_get_functiondef('public.dp_preadmissao_sincronizar_rotina()'::regprocedure);
 IF position('cargo_id=cargo, unidade_id=unidade' in s)=0 THEN RAISE EXCEPTION 'Definição de sincronização divergente'; END IF;
 s:=replace(s,'  cargo uuid;','  v_cargo uuid;');
 s:=replace(s,'  cargo := COALESCE(','  v_cargo := COALESCE(');
 s:=replace(s,'IF cargo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_cargos WHERE id=cargo AND','IF v_cargo IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dp_cargos WHERE id=v_cargo AND');
 s:=replace(s,'cargo_id=cargo, unidade_id=unidade','cargo_id=v_cargo, unidade_id=unidade');
 IF s ~ '[^_a-z.]cargo[^_a-z]' THEN RAISE EXCEPTION 'Referência a cargo restante'; END IF;
 EXECUTE s;
END $migration$;