INSERT INTO public.company_modules (company_id, module, status, starts_at, contratado_em, notes)
VALUES ('fbcf2e49-426c-4f4d-a639-aca2a95ed76b','dp','active', now(), now(), 'Cliente da base anterior — liberado na mesma condição da PRAIANOS BAR E RESTAURANTE')
ON CONFLICT DO NOTHING;

INSERT INTO public.company_members (company_id, user_id, role, perfil, situacao, ver_salarios, permissions, modulos)
SELECT 'fbcf2e49-426c-4f4d-a639-aca2a95ed76b', user_id, role, perfil, situacao, ver_salarios, permissions, modulos
FROM public.company_members
WHERE id = '7d29c7a9-7fd3-4377-8789-0cde0b5f1727'
  AND NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id='fbcf2e49-426c-4f4d-a639-aca2a95ed76b' AND user_id='b69323e5-b07d-4134-91d7-90f8e61b63a0');