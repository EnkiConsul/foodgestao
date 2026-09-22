-- Test-fixture repair only; never part of the production migration.
BEGIN;
CREATE TEMP TABLE f01_repair_before AS
SELECT t.id,t.context,t.account_id,a.context AS account_context
FROM public.transactions t JOIN public.accounts a ON a.id=t.account_id
JOIN public.companies c ON c.id=t.company_id
WHERE t.id IN ('48e61a8a-b485-45e3-b67b-cabc0eb8aab7','a49d72cb-2813-4a44-8ce0-f081efbf127d')
AND t.description LIKE 'Receita Fictícia L01 Empresa %'
AND c.name LIKE 'HOMOLOGAÇÃO L01 Empresa %'
AND t.context='pf' AND t.company_id=a.company_id AND a.context='pf';
DO $$ BEGIN
 IF (SELECT count(*) FROM f01_repair_before)<>2 THEN RAISE EXCEPTION 'unexpected fixture state'; END IF;
END $$;
UPDATE public.accounts SET context='pj' WHERE id IN (SELECT account_id FROM f01_repair_before);
UPDATE public.transactions SET context='pj' WHERE id IN (SELECT id FROM f01_repair_before);
SELECT 'synthetic_fixtures_normalized' AS result,count(*) AS total FROM f01_repair_before;
COMMIT;
