# Open Finance: conta reconectada sem saldo e sem lançamentos

## O que está acontecendo (verificado nos dados)

A nova conexão do Banco do Brasil sincronizou normalmente: 3 contas lidas, saldo de R$ 69.920,26 e 276 lançamentos gravados (25/07 a 24/08, todos como "pendentes" para conciliação).

O problema é o vínculo: a sincronização religou a conta do Open Finance a uma conta financeira que havia sido **excluída** (a conta "BANCO DO BRASIL S/A" está marcada como excluída em 24/08 18:27 e inativa). Como as telas escondem contas excluídas, o saldo e os lançamentos existem no banco, mas não aparecem em nenhum lugar.

## Correções

1. **Não reaproveitar conta excluída/inativa na sincronização**
   Na função de sincronização da Pluggy, ao procurar uma conta local existente para religar (por número mascarado já vinculado antes, ou por banco + número), passar a ignorar contas com exclusão marcada ou inativas. Sem candidata válida, o sistema cria uma conta nova — como já faz no primeiro vínculo — com o saldo vindo do Open Finance.

2. **Reparar o caso atual desta empresa**
   Restaurar a conta financeira do Banco do Brasil (remover a marcação de exclusão e reativar) e manter o vínculo com a nova conexão, para que o saldo e os 276 lançamentos apareçam imediatamente. Alternativa, se você preferir manter a conta antiga excluída: criar uma conta nova e apontar o vínculo para ela.

3. **Corrigir erro secundário no sincronismo novo (v2)**
   O log mostra que a rota nova de transações da Pluggy está rejeitando os parâmetros enviados (`from` e `pageSize`). Isso hoje é não fatal (não afeta o que o cliente vê, pois o caminho principal funciona), mas deixa a base espelho vazia. Ajustar a chamada para os parâmetros aceitos pela rota v2 (paginação por cursor) e revalidar pelos logs.

## Detalhes técnicos

- `supabase/functions/pluggy-sync-item/index.ts` (~linhas 411-465): adicionar `is('soft_deleted_at', null)` / `eq('is_active', true)` nas buscas 1a (via `pluggy_accounts.linked_account_id` → validar a conta em `accounts`) e 1b, antes de reutilizar `existingAccountId`.
- Migração pontual de dados: `accounts.soft_deleted_at = null`, `is_active = true` para `1c6264db-70f1-4b47-944e-d7b8cdc59b90` (empresa PRAIANOS), mantendo `pluggy_accounts.linked_account_id` da conexão `9f1bdb88…`.
- `supabase/functions/_shared/pluggy-client.ts` → `listTransactionsV2`: revisar query string conforme a API v2 (remover `from`/`pageSize` não aceitos, usar cursor).

## Verificação

- Após o reparo, conferir na tela de contas bancárias o saldo de R$ 69.920,26 e, na conciliação, os 276 lançamentos pendentes do período.
- Excluir e reconectar a mesma conta em teste deve gerar uma conta nova (nunca reviver a excluída silenciosamente).
