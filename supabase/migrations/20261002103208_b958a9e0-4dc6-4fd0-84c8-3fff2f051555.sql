ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS folha_ponto_dispensa_justificativa text;
COMMENT ON COLUMN public.dp_colaboradores.folha_ponto_dispensa_justificativa IS
  'Justificativa da dispensa do controle de ponto em unidade com mais de 20 pessoas (Art. 74 CLT). Reverter: DROP COLUMN.';