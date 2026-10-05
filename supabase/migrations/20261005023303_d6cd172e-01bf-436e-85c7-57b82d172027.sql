UPDATE public.dp_folga_limite_regras
   SET ativo = false,
       observacao = coalesce(observacao || ' | ', '') || 'Desativada em 05/10/2026: duplicada da regra dc98c967'
 WHERE id = 'b6574802-28fc-4f7a-a25c-a3a72830c102' AND ativo = true;