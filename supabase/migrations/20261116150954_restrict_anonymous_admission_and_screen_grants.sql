-- Keep admission RPCs and trigger helpers outside anonymous access.
REVOKE EXECUTE ON FUNCTION public.dp_admissao_regras_guard() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dp_admissao_regra_excluir(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dp_admissao_regra_salvar(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dp_colaborador_pagamento_guard() FROM PUBLIC, anon;

-- The screen configuration is consumed after login; authenticated access
-- continues to depend on the existing read and administrator policies.
REVOKE ALL PRIVILEGES ON TABLE public.app_hidden_screens FROM PUBLIC, anon;
