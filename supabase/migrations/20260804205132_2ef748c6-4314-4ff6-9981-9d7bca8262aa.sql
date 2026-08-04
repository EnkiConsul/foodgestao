-- 1) dp_epis: leitura do catálogo de EPIs para membros da empresa (escrita segue admin/owner)
CREATE POLICY "dp_epis_member_read"
ON public.dp_epis
FOR SELECT
TO authenticated
USING (private.is_company_member((SELECT auth.uid()), company_id));

-- 2) realtime.messages: casamento exato de segmentos do tópico (sem depender de regex concatenado)
DROP POLICY IF EXISTS "Users can subscribe to own topics" ON realtime.messages;

CREATE POLICY "Users can subscribe to own topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- sync-pf-<uuid do usuário>-<sufixo>
  (
    left(realtime.topic(), 8) = 'sync-pf-'
    AND substring(realtime.topic() from 9 for 36) = ((SELECT auth.uid()))::text
    AND substring(realtime.topic() from 45 for 1) = '-'
    AND substring(realtime.topic() from 46) ~ '^[a-zA-Z0-9_.:-]{1,64}$'
  )
  OR
  -- sync-pj-<uuid da empresa>-<sufixo>
  (
    left(realtime.topic(), 8) = 'sync-pj-'
    AND substring(realtime.topic() from 45 for 1) = '-'
    AND substring(realtime.topic() from 46) ~ '^[a-zA-Z0-9_.:-]{1,64}$'
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND (cm.company_id)::text = substring(realtime.topic() from 9 for 36)
    )
  )
);