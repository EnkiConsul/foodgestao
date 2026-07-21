## Problema

Ao remover uma conexão Open Finance em `/contas-bancarias`, o registro é apagado localmente mas o item permanece visível no painel da Pluggy.

A Edge Function `pluggy-delete-connection` já chama `DELETE /items/{provider_item_id}`, porém:

- A chamada está dentro de um `try/catch` que apenas faz `console.warn` — se o Pluggy responder erro (token expirado, 5xx, rede), o item **não é deletado** e mesmo assim o registro local é apagado, deixando o item órfão no painel Pluggy sem forma do usuário retentar.
- Não há retorno para o frontend indicando que a revogação remota falhou.

## Correção

### 1. `supabase/functions/pluggy-delete-connection/index.ts`
- Sair do padrão "swallow error". Chamar `deleteItem(provider_item_id)` **antes** de apagar as linhas locais.
- Tratar 404 como sucesso (item já não existe no Pluggy).
- Em qualquer outro erro do Pluggy: **não apagar** `bank_connections` / `bank_connection_accounts`; retornar HTTP 502 com mensagem clara (`"Falha ao revogar consentimento no Pluggy: <status>"`) para a UI exibir e permitir nova tentativa.
- Logar `console.error` com `connectionId` e `provider_item_id` para diagnóstico.
- Adicionar um parâmetro opcional `force: boolean` no `BodySchema` (default `false`). Quando `true` e o usuário for `super_admin` (via `has_role`), permitir apagar localmente mesmo se o Pluggy falhar — cobre casos em que o item já foi deletado manualmente no painel Pluggy.

### 2. `supabase/functions/_shared/pluggy.ts`
- Em `deleteItem`, incluir o corpo da resposta na mensagem de erro para facilitar debug (`throw new Error(\`Pluggy deleteItem: ${res.status} ${text}\`)`).

### 3. `src/components/accounts/OpenFinanceSection.tsx` + `src/hooks/usePluggy.ts`
- Propagar mensagem de erro da Edge Function no `toast.error` (hoje mostra genérico).
- No `AlertDialog` de confirmação, quando a mutação falhar com erro do Pluggy, exibir botão adicional **"Remover mesmo assim"** visível apenas se `useIsSuperAdmin()` for `true`, chamando novamente com `force: true`. Usuários comuns veem apenas "Tentar novamente".

### 4. Verificação
- Testar: desconectar a conexão Santander atual (que está com item ativo no painel Pluggy) e conferir que o item some do painel.
- Se o painel Pluggy tiver itens órfãos de exclusões anteriores, listá-los depois e apagar manualmente via nova tentativa (o registro local já foi removido, então o super admin precisa apagar direto no painel Pluggy — sem código nosso para isso).

## Fora de escopo
- Sincronização periódica reverse (Pluggy → local) para detectar itens órfãos.
- Reprocessamento em background com fila de retry.
