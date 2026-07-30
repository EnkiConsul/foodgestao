## Decisão

Desativar a conta **não** apaga mais nada na Pluggy. A conexão continua existindo (e visível no painel da Pluggy); só a sincronização daquela conta fica pausada do nosso lado. Isso reverte o comportamento de exclusão do item que havia sido adotado antes.

## O que acontece ao desativar (comportamento alvo)

1. `accounts.is_active = false`.
2. A trigger existente marca `pluggy_accounts.sync_paused_at` + `sync_paused_reason = 'account_inactive'` para a conta vinculada.
3. `pluggy-sync-item` ignora contas pausadas; `pluggy-cron-sync` pula a conexão quando **todas** as contas dela estão pausadas (economia de chamadas, sem excluir o item).
4. Nenhuma chamada de `deleteItem` na Pluggy. Nenhum `delete` em `pluggy_connections` / `pluggy_accounts`.
5. Diálogo de confirmação passa a dizer apenas: a sincronização desta conta fica pausada e volta automaticamente ao reativar; a conexão com o banco permanece ativa e continua aparecendo no painel Open Finance.

## O que acontece ao ativar

1. `accounts.is_active = true`.
2. A trigger limpa `sync_paused_at` / `sync_paused_reason` → sincronização retomada.
3. Se a conexão está viva: dispara um sync imediato daquele item (`pluggy-sync-item`) para atualizar saldo e lançamentos na hora, com toast "Conta ativada — sincronização Open Finance retomada".
4. Só se a conexão realmente não existir mais (registro ausente, ou status `deleted`/`login_error` — casos de conexões encerradas antes desta mudança, ou expiradas no banco) o app abre o diálogo "Reconectar via Open Finance", que usa o `PluggyConnectDialog` já existente. Com a conexão saudável, nenhum fluxo de reconexão é exibido.

## Mudanças

- **`supabase/functions/pluggy-pause-or-delete/index.ts`**: remover a exclusão do item na Pluggy e o `delete` das linhas locais. Passa a apenas confirmar/garantir a pausa e retornar `scope: 'paused'`. (Mantenho a função para o app continuar funcionando; ela vira "pluggy-pause" na prática.)
- **`src/pages/ContasBancarias.tsx`**:
  - Texto do diálogo de desativação: remover o aviso de "conexão será encerrada / precisará reconectar", inclusive o caso "última conta ativa"; manter só a explicação da pausa.
  - Remover o estado `deactivateOfLast` e a consulta de contagem que o alimentava.
  - Na ativação (contexto PJ): consultar `pluggy_accounts` + status da conexão daquela conta. Conexão saudável → invocar sync do item e toast de retomada. Conexão inexistente/`deleted`/`login_error` → diálogo com "Reconectar via Open Finance" (abre o `PluggyConnectDialog`) ou "Ativar sem conectar".
- **`src/pages/ConexoesPluggy.tsx`**: manter/ajustar o selo "Sincronização pausada" e exibir conexões com status `deleted` como "Encerrada — reconectar" (só afeta conexões já encerradas no passado).
- **`supabase/functions/pluggy-sync-item/index.ts`**: no religamento pós-reconexão, considerar também `pluggy_accounts` de conexões antigas ao reaproveitar `linked_account_id` (evita criar conta duplicada), e limpar a pausa da conta religada.

## Detalhes técnicos

- Sem migração de schema: `sync_paused_at` / `sync_paused_reason` e a trigger de pausa/retomada já existem.
- Saldo continua sendo escrito exclusivamente pelo motor financeiro (RPC `sync_of_account_balance`).
- Efeito colateral aceito e explícito: a conexão continuará listada como ativa no painel da Pluggy mesmo com a conta desativada — foi a escolha desta iteração.
