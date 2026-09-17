-- Menor privilegio: remover EXECUTE de anon/PUBLIC em funcoes SECURITY DEFINER
-- 1) chart_accounts_block_delete_with_history(): funcao de trigger, nunca precisa EXECUTE direto
REVOKE ALL ON FUNCTION public.chart_accounts_block_delete_with_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chart_accounts_block_delete_with_history() FROM anon;
REVOKE ALL ON FUNCTION public.chart_accounts_block_delete_with_history() FROM authenticated;

-- 2) my_pending_invites(): depende de auth.uid(), so faz sentido autenticado
REVOKE ALL ON FUNCTION public.my_pending_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_pending_invites() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_pending_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pending_invites() TO service_role;