# Auditoria do backoffice não mostra todos os logs

## Diagnóstico (verificado no banco)

1. **Leitura bloqueada pela API de dados**: a tabela `audit_logs` e todas as suas partições não têm nenhum `GRANT` para o papel `authenticated` (só existe grant para o papel interno de manutenção). A política de RLS "Super admins can view audit logs" está correta, mas sem GRANT a consulta do painel nunca retorna dados pela API.
2. **Escrita do app quebrada**: a função `insert_audit_log` (usada por Lançamentos, Categorias, Contatos, Contas, Empresas e telas admin) **não é SECURITY DEFINER** e não tem `EXECUTE` concedido a `authenticated`. Além disso existe uma política RESTRICTIVE "Deny insert on audit logs" para `authenticated`. Resultado: essas chamadas falham silenciosamente. Hoje há 503 registros, e o último é de 10/08/2026 — apenas os logs gravados por Edge Functions (service_role) sobrevivem.
3. **Filtro de ações incompleto na tela**: `AdminAuditLogs.tsx` usa uma lista fixa de 19 ações, mas o banco já tem 28 ações distintas (ex.: `account_hard_deleted`, `transactions_bulk_deleted`, `orders_unit_created`, `subscription_exempted`, `reset_data`). As ações fora da lista aparecem sem rótulo amigável e não podem ser filtradas.

## Correções

### 1. Permissões (migração)
- `GRANT SELECT ON public.audit_logs TO authenticated` (a RLS continua limitando a super admins) e `GRANT ALL ... TO service_role`, aplicando também nas partições existentes e no `audit_logs_default`.
- Ajustar o `DEFAULT` das partições futuras para já nascerem com os grants (a função/rotina que cria partições passa a emitir os GRANTs).

### 2. Voltar a gravar os logs do app (migração)
- Recriar `insert_audit_log` como `SECURITY DEFINER` com `SET search_path = public`, mantendo a assinatura atual e preenchendo `user_id`/`user_name` a partir de `auth.uid()`.
- `GRANT EXECUTE ON FUNCTION public.insert_audit_log(...) TO authenticated`.
- As políticas de negar INSERT/UPDATE/DELETE direto para `authenticated`/`anon` permanecem — logs continuam imutáveis e só entram pela função.

### 3. Tela de auditoria (`src/components/admin/AdminAuditLogs.tsx`)
- Carregar a lista de ações do filtro dinamicamente (ações distintas existentes), em vez da lista fixa.
- Rótulo de fallback legível para ações sem tradução (converter `snake_case` em texto), mantendo os rótulos atuais.
- Ampliar a busca para incluir `entity_id`.
- Corrigir o aviso de `ref` no console (Badge dentro de um componente que passa ref) envolvendo o Badge em `span`.

## Verificação
- Consultar `audit_logs` como usuário autenticado super admin e confirmar retorno com contagem total.
- Criar um lançamento e conferir que aparece um novo registro `transaction_created` na tela.
- Conferir que um usuário não super admin continua sem acesso aos logs.
