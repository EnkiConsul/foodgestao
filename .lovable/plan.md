## Objetivo

Ao **desativar** uma conta bancária vinculada ao Open Finance, pausar a sincronização daquela conta na Pluggy — sem excluir a conexão nem perder o histórico. Ao **reativar**, a sincronização volta automaticamente.

## Estado atual (verificado)

- `handleToggleActive` em `ContasBancarias.tsx` só faz `update({ is_active })` em `accounts`; nada toca a Pluggy.
- O `pluggy-cron-sync` busca **todas** as conexões com status diferente de `deleted`/`login_error` e chama `pluggy-sync-item` por item.
- `pluggy-sync-item` percorre as contas do item, espelha em `pluggy_accounts` e grava transações em `pluggy_staging_transactions`.
- `pluggy-webhook` também dispara `pluggy-sync-item` a cada evento do item.
- Uma conexão (item) pode ter **várias** contas; por isso a pausa precisa ser por conta, não pelo item inteiro.

## Como vai funcionar

Pausa **por conta Open Finance**:

1. Desativar a conta bancária → a conta Pluggy correspondente fica marcada como pausada.
2. O sync continua rodando para o item, mas **ignora** as contas pausadas: não atualiza saldo, não cria transações em staging.
3. Se **todas** as contas de um item estiverem pausadas, o cron pula o item inteiro (economiza chamadas à Pluggy).
4. Reativar a conta bancária → remove a pausa; a próxima sincronização volta a trazer os dados.

## Alterações

**Banco de dados (migração)**
- Adicionar `sync_paused_at timestamptz` (nulo = ativo) e `sync_paused_reason text` em `pluggy_accounts`.
- Trigger em `accounts`: ao mudar `is_active`, marcar/limpar `sync_paused_at` nas linhas de `pluggy_accounts` com `linked_account_id` correspondente (razão: `account_inactive`). Assim a pausa vale mesmo se a conta for desativada por outra tela ou pelo backend.

**Edge functions**
- `pluggy-sync-item`: pular contas pausadas nos dois laços (espelho/saldo e transações).
- `pluggy-cron-sync`: não chamar o sync de itens em que todas as contas estão pausadas.

**Frontend**
- `ContasBancarias.tsx`: no diálogo de desativação, trocar o texto atual por: a conexão com o banco **não** é removida, mas a sincronização desta conta fica **pausada** e volta ao reativar. Mostrar o nome do banco quando houver vínculo.
- Toast de reativação informando que a sincronização foi retomada.
- `ConexoesPluggy.tsx`: exibir um selo "Sincronização pausada" nas contas pausadas, para o estado ficar visível também na tela de conexões.

## Detalhes técnicos

- A pausa é dirigida pelo banco (trigger), então nenhum caminho de código pode esquecer de aplicá-la.
- Nada é apagado: `pluggy_accounts`, `pluggy_connections` e o staging já importado permanecem.
- Contas em contexto PF (sem `company_id` da Pluggy) não têm vínculo Open Finance e seguem sem mudança.
