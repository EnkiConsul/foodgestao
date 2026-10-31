-- P1: claims das filas Pluggy nunca devolvem o mesmo id duas vezes.
-- Roda tudo e termina em exceção (rollback): nada é gravado.
-- Esperado: sobreposicao=f nos dois e skip_locked=t t (garante concorrência real).
do $$
declare a uuid[]; b uuid[]; c uuid[]; d uuid[];
begin
  select array_agg(id) into a from public.pluggy_connections_claim_due(3,10);
  select array_agg(id) into b from public.pluggy_connections_claim_due(3,10);
  select array_agg(id) into c from public.pluggy_remote_delete_claim(3,90);
  select array_agg(id) into d from public.pluggy_remote_delete_claim(3,90);
  raise exception 'RESULTADO_TESTE claim_due sobreposicao=% | remote_delete sobreposicao=% | skip_locked=% %',
    coalesce(a && b,false), coalesce(c && d,false),
    pg_get_functiondef('public.pluggy_connections_claim_due(int,int)'::regprocedure) ilike '%skip locked%',
    pg_get_functiondef('public.pluggy_remote_delete_claim(int,int)'::regprocedure) ilike '%skip locked%';
end $$;
