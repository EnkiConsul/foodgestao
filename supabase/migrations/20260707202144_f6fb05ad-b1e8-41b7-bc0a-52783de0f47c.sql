
-- 1) Revogar EXECUTE de anon/PUBLIC em pluggy_upsert_transaction (SECURITY DEFINER).
--    A função só deve ser executada pelo service_role dentro das edge functions pluggy-*.
REVOKE ALL ON FUNCTION public.pluggy_upsert_transaction(uuid, text, text, numeric, date, transaction_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pluggy_upsert_transaction(uuid, text, text, numeric, date, transaction_type) FROM anon;
REVOKE ALL ON FUNCTION public.pluggy_upsert_transaction(uuid, text, text, numeric, date, transaction_type) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_upsert_transaction(uuid, text, text, numeric, date, transaction_type) TO service_role;

-- 2) dre_rubricas: catálogo de referência compartilhado, sem company_id.
--    A policy antiga verificava "usuário existe em company_members" (sem escopo),
--    o que era um padrão frágil. Como o conteúdo é referência pública ao app,
--    trocar por leitura simples para authenticated.
DROP POLICY IF EXISTS "Company members can read dre_rubricas" ON public.dre_rubricas;
CREATE POLICY "Authenticated can read dre_rubricas"
  ON public.dre_rubricas
  FOR SELECT
  TO authenticated
  USING (true);

-- 3) Storage transaction-attachments: adicionar INSERT/UPDATE/DELETE company-scoped
--    para que membros da empresa com permissão de edição em 'transactions' possam
--    gerenciar anexos compartilhados (hoje SELECT já é company-scoped, mas writes
--    ficavam bloqueados por só olhar auth.uid() como prefixo).
CREATE POLICY "Company editors can insert company transaction attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'transaction-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE (t.id)::text = (storage.foldername(name))[2]
        AND cm.user_id = auth.uid()
        AND private.member_can_edit(auth.uid(), t.company_id, 'transactions')
    )
  );

CREATE POLICY "Company editors can update company transaction attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE (t.id)::text = (storage.foldername(objects.name))[2]
        AND cm.user_id = auth.uid()
        AND private.member_can_edit(auth.uid(), t.company_id, 'transactions')
    )
  )
  WITH CHECK (
    bucket_id = 'transaction-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE (t.id)::text = (storage.foldername(name))[2]
        AND cm.user_id = auth.uid()
        AND private.member_can_edit(auth.uid(), t.company_id, 'transactions')
    )
  );

CREATE POLICY "Company editors can delete company transaction attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'transaction-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      JOIN public.company_members cm ON cm.company_id = t.company_id
      WHERE (t.id)::text = (storage.foldername(objects.name))[2]
        AND cm.user_id = auth.uid()
        AND private.member_can_edit(auth.uid(), t.company_id, 'transactions')
    )
  );
