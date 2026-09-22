-- =====================================================================
-- FASE 2 (parte 3) — menor privilégio de escrita em solicitações
-- Rollback no final (comentado).
-- =====================================================================

DROP POLICY IF EXISTS dp_sol_colab_self_write ON public.dp_solicitacoes;
DROP POLICY IF EXISTS dp_sol_member_insert ON public.dp_solicitacoes;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dp_solicitacoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, SELECT ON public.dp_solicitacoes FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.dp_adiantamento_solicitacoes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, SELECT ON public.dp_adiantamento_solicitacoes FROM anon;

GRANT SELECT ON public.dp_solicitacoes TO authenticated;
GRANT SELECT ON public.dp_adiantamento_solicitacoes TO authenticated;
GRANT ALL ON public.dp_solicitacoes TO service_role;
GRANT ALL ON public.dp_adiantamento_solicitacoes TO service_role;

-- ROLLBACK
-- GRANT INSERT ON public.dp_solicitacoes TO authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.dp_adiantamento_solicitacoes TO authenticated;
-- CREATE POLICY dp_sol_colab_self_write ON public.dp_solicitacoes FOR INSERT TO authenticated
--   WITH CHECK (colaborador_id IS NOT NULL
--     AND public.dp_colaborador_ativo_of((SELECT auth.uid())) IS NOT NULL
--     AND colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
--     AND company_id = (SELECT c.company_id FROM public.dp_colaboradores c
--                        WHERE c.id = public.dp_colaborador_ativo_of((SELECT auth.uid()))));
-- CREATE POLICY dp_sol_member_insert ON public.dp_solicitacoes FOR INSERT TO authenticated
--   WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
--     OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid()))
--     OR public.is_super_admin((SELECT auth.uid())));
