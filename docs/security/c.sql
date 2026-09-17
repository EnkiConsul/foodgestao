BEGIN;
SELECT 'C ' || (public.dp_preadmissao_enviar('33333333-3333-4333-8333-333333333333', ARRAY['em_preenchimento'], 20))::text;
SELECT pg_sleep(3);
COMMIT;
