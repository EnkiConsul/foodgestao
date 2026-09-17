BEGIN;
SELECT public.dp_preadmissao_salvar_candidato('33333333-3333-4333-8333-333333333333',
  ARRAY['em_preenchimento'], 'em_preenchimento', '{"nome_completo":"CANDIDATO A"}'::jsonb, '{}'::jsonb,
  '[{"nome":"filho dois","parentesco":"filho","data_nascimento":"2019-01-02","finalidade_dependente":true}]'::jsonb, 10);
SELECT pg_sleep(4);
COMMIT;
