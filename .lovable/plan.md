## Diagnóstico

Na Base de Dados Open Finance (Bloco 1) foi criada a trigger `prevent_hard_delete_account_with_history` em `public.accounts` que bloqueia `DELETE` quando a conta tem `transactions`, `open_finance_accounts` vinculadas ou `credit_card_invoices` referenciando-a — e recomenda usar `soft_delete_account`.

Porém `src/pages/ContasBancarias.tsx` (linha 133) ainda faz `supabase.from("accounts").delete().eq("id", ...)`, o que dispara a trigger e retorna erro → o toast "Erro ao excluir conta" que apareceu na sessão.

## Correção

Ajustar `handleDelete` em `src/pages/ContasBancarias.tsx` para:

1. Tentar **soft delete** via RPC `soft_delete_account(_account_id)` como caminho padrão (marca `is_active=false`, `soft_deleted_at=now()`, preserva histórico).
2. Se a RPC retornar erro por vínculo Open Finance ativo (mensagem indicando `open_finance_accounts`), orientar o usuário a desconectar antes (toast informativo).
3. Se a conta não tiver histórico algum (caso raro — cadastrada e nunca usada), a RPC ainda funciona (só marca inativa); não tentar hard delete pelo cliente.
4. Ajustar a UI do `AlertDialog`:
   - Título: "Excluir conta bancária"
   - Descrição atualizada: explicar que a conta será arquivada preservando o histórico de lançamentos, e não será mais listada.
   - Manter botão "Excluir" com variante destrutiva.
5. Manter `insert_audit_log` com ação `account_deleted` após sucesso.
6. Ajustar `fetchAccounts` para continuar filtrando `soft_deleted_at IS NULL` (verificar consulta atual e adicionar filtro se ainda não existir).

## Fora do escopo

- Não alterar a trigger nem RPCs no banco (já estão corretos conforme Bloco 1).
- Não alterar outros pontos que fazem `.delete()` em `accounts` (não há outros).
- Não expor botão de "restaurar conta arquivada" nesta fase.

## Entregáveis

- 1 arquivo alterado: `src/pages/ContasBancarias.tsx` (handleDelete + textos do AlertDialog + filtro `soft_deleted_at` no fetch se faltar).
