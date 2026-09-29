UPDATE public.company_members
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
      'dp.colaboradores','total',
      'dp.escalas','total',
      'dp.folgas','total',
      'dp.ferias','total',
      'dp.convocacoes','total',
      'dp.ocorrencias','total',
      'dp.documentos','total',
      'dp.avisos','total',
      'dp.beneficios','total',
      'dp.cadastros','total',
      'dp.relatorios','total'
    ),
    modulos = COALESCE(modulos, '{}'::jsonb) || jsonb_build_object('pessoas', true),
    ver_salarios = true,
    updated_at = now()
WHERE id = '7d29c7a9-7fd3-4377-8789-0cde0b5f1727'
  AND company_id = 'bab7a4ac-0b95-4b69-ba18-ac862bfb038b'
  AND user_id = 'b69323e5-b07d-4134-91d7-90f8e61b63a0';