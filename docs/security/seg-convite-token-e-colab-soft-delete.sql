-- Correções dos 2 achados selecionados da varredura de segurança.
-- ATENÇÃO: NÃO aplicado — a ferramenta de migração está desativada por
-- preferência de aprovação ("tool disabled by approval preference").
--
-- 1) company_invites: a policy "Invited user can view own invites" permitia ao
--    convidado ler a LINHA INTEIRA do convite (incluindo o token — credencial
--    portadora para entrar na empresa — e as permissions) via SELECT direto.
--    O convidado não precisa desse SELECT: a listagem passa por
--    public.my_pending_invites() (SECURITY DEFINER, filtra por lower(jwt email))
--    e o aceite pela edge function accept-invite (service role). Admin/owner
--    mantêm "Admins can view company invites" e continuam copiando o link.
--
-- 2) dp_colaboradores: a policy dp_colab_admin_write (ALL) tem USING com
--    deleted_at IS NULL mas WITH CHECK sem a mesma condição — assimetria que
--    permitiria deixar/gravar linha em estado excluído por escrita direta.
--    Exclusão e restauração continuam pelas rotinas SECURITY DEFINER
--    dp_excluir_colaborador / dp_restaurar_colaborador, que não passam por RLS.
--
-- Rollback: recriar a policy do convidado (SELECT com
-- lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email',''))) e recriar
-- dp_colab_admin_write sem a condição no WITH CHECK.

DROP POLICY IF EXISTS "Invited user can view own invites" ON public.company_invites;

DROP POLICY IF EXISTS dp_colab_admin_write ON public.dp_colaboradores;
CREATE POLICY dp_colab_admin_write ON public.dp_colaboradores
  FOR ALL
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = dp_colaboradores.company_id
          AND c.user_id = (SELECT auth.uid())
      )
      OR public.is_super_admin((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND (
      private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = dp_colaboradores.company_id
          AND c.user_id = (SELECT auth.uid())
      )
      OR public.is_super_admin((SELECT auth.uid()))
    )
  );
