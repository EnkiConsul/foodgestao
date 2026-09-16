-- Presença: leitura do tópico apenas para super admin; escrita para usuários autenticados.
DROP POLICY IF EXISTS "Super admins can read presence topic" ON realtime.messages;
CREATE POLICY "Super admins can read presence topic" ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.topic() = 'presence:online-users'
  AND public.is_super_admin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated can publish own presence" ON realtime.messages;
CREATE POLICY "Authenticated can publish own presence" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() = 'presence:online-users'
);