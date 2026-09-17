SELECT 'D ' || (public.dp_preadmissao_salvar_candidato('33333333-3333-4333-8333-333333333333',
  ARRAY['em_preenchimento'], 'em_preenchimento', '{"nome_completo":"ALTERADO DEPOIS"}'::jsonb, '{}'::jsonb,
  '[]'::jsonb))::text;
