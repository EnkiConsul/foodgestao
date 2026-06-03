# Corrigir erro ao atualizar saldo da conta bancária (PJ)

## Causa raiz
Logs do Postgres mostram: `permission denied for function member_can_edit`.

A política RLS de UPDATE em `public.accounts` chama `private.member_can_edit(auth.uid(), company_id, 'accounts')`. O role `authenticated` não tem privilégio `EXECUTE` nessa função (nem nas auxiliares `member_permission` e `is_company_member`), então a policy falha ao avaliar e a atualização é negada. O mesmo problema afeta qualquer outra tabela cujas policies dependam dessas funções (transactions, categories, contacts, payment_methods, budgets etc.).

## Correção
Migração única concedendo `EXECUTE` ao role `authenticated` (e `service_role`) em todas as funções do schema `private` usadas pelas RLS policies:

- `private.member_can_edit(uuid, uuid, text)`
- `private.member_permission(uuid, uuid, text)`
- `private.is_company_member(uuid, uuid)`
- demais funções de `private` referenciadas por policies (vou listar via `pg_proc` e conceder em bloco para não deixar nenhuma de fora).

Também garantir `GRANT USAGE ON SCHEMA private TO authenticated, service_role` (necessário para resolver o nome da função).

## Validação
1. Após a migração, repetir a edição do saldo da conta `SuitPay - Raptor` como o usuário atual.
2. Conferir que aparece o toast "Conta atualizada" e que `audit_logs` registra `account_updated`.
3. Reexecutar `supabase--analytics_query` filtrando por `permission denied` para confirmar que o erro parou.

## Fora do escopo (anotado para depois)
- Os erros `invalid column for filter company_id` apontam para algum `.eq("company_id", ...)` em uma view/relação que não tem a coluna. Investigar separadamente — não afeta o saldo.
