## Objetivo

Hoje a pausa é só do nosso lado: o item continua existindo na Pluggy e por isso o painel deles mostra a conexão como ativa. Quando **todas** as contas de uma conexão forem pausadas (contas bancárias locais desativadas), o item deve ser **excluído na Pluggy**.

## Estado atual (verificado)

- `pluggy-disconnect-item` já sabe fazer os dois escopos: remover só uma conta (quando a conexão tem mais de uma) ou excluir o item na Pluggy (`deleteItem`) e apagar a conexão local.
- A desativação (`applyToggleActive` em `ContasBancarias.tsx`) só faz `update({ is_active })`; a trigger no banco marca `sync_paused_at` em `pluggy_accounts`. Nada chama a Pluggy.
- `pluggy-cron-sync` já pula conexões cujas contas estão todas pausadas.

## Como vai funcionar

1. Ao desativar uma conta com vínculo Open Finance, verificamos se sobrou alguma conta **ativa** naquela conexão.
2. Se sobrou: comportamento atual (pausa apenas daquela conta).
3. Se não sobrou nenhuma: chamamos a Pluggy e **excluímos o item** — ele some do painel Pluggy. Os dados locais (lançamentos já confirmados) permanecem.
4. Como o consentimento é encerrado, reativar a conta **não** retoma sozinho: será preciso reconectar o banco em *Conexões Open Finance*.

## Alterações

**Edge function**
- Nova função `pluggy-pause-or-delete` (ou novo modo em `pluggy-disconnect-item`, `reason: 'account_deactivated'`): recebe `account_id` local, valida a permissão pelo `company_members`, e:
  - se ainda houver conta ativa na conexão → apenas confirma a pausa e retorna `scope: 'paused'`;
  - se todas pausadas → `deleteItem(pluggy_item_id)`, apaga staging pendente e marca a conexão local como removida (mesma limpeza do fluxo de desconexão), retornando `scope: 'connection_deleted'`.

**Frontend — `ContasBancarias.tsx`**
- No diálogo de desativação, quando a conta é a **última ativa** daquela conexão, trocar o texto: a conexão com o banco será **encerrada na Pluggy** e reativar exigirá reconectar.
- Após `applyToggleActive` (só na desativação), invocar a função acima e ajustar o toast conforme o escopo retornado.

**Frontend — `ConexoesPluggy.tsx`**
- Sem mudança estrutural: conexões excluídas deixam de aparecer; o selo "Sincronização pausada" continua válido para pausas parciais.

## Detalhes técnicos

- A exclusão do item é irreversível na Pluggy; por isso o aviso explícito antes de confirmar.
- Falha na chamada à Pluggy não bloqueia a desativação local — registramos o erro e avisamos no toast para o usuário tentar pela tela de conexões.
- Contas PF (sem vínculo Open Finance) seguem sem alteração.
