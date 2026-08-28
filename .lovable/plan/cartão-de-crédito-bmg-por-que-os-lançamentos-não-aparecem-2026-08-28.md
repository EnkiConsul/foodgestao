# Cartão de crédito BMG: por que os lançamentos não aparecem

## O que os dados mostram

A sincronização do BMG está funcionando, inclusive no cartão:

- Conexão "Banco Bmg" sincronizou às 23:47 de hoje, status `updated` / `SUCCESS`, sem erro.
- A conta de cartão `CARTAO BARCELONA` (CREDIT_CARD, final 2691) já está autorizada e vinculada a um cartão do sistema.
- Dados brutos do cartão: 71 lançamentos, de 02/09/2025 até 18/08/2026.
- Fila de conciliação do cartão: 9 lançamentos pendentes (30/07 a 18/08/2026).

Ou seja: os lançamentos chegaram, mas você não tem por onde vê-los. Duas causas confirmadas:

1. **A conciliação por conta esconde o cartão.** Quando você abre a conciliação a partir de uma conta bancária (a tela atual, escopada na conta corrente BMG), a consulta filtra só pela conta Pluggy daquela conta corrente. Contas de cartão são vinculadas a um cartão, não a uma conta bancária, então nunca entram nesse escopo — e não existe hoje um atalho equivalente partindo do cartão de crédito.
2. **Só a janela recente virou fila.** A sincronização normal traz 30 dias. Os 71 lançamentos brutos desde setembro/2025 existem, mas apenas os últimos 30 dias foram promovidos para conciliação; o restante do histórico precisa de backfill.

## O que fazer

### 1. Escopo de conciliação por cartão de crédito
- Aceitar um escopo por cartão na conciliação (além do escopo por conta bancária), resolvendo a conta Pluggy pelo vínculo do cartão.
- Na tela de Cartões de Crédito, incluir a ação "Conciliar lançamentos" por cartão, levando à conciliação já filtrada.
- Cabeçalho da conciliação mostra o cartão (bandeira/final) quando o escopo é de cartão.

### 2. Não perder o cartão na visão geral
- Na conciliação sem escopo, garantir que os itens de cartão apareçam com o selo do cartão de destino (já existe o roteamento para fatura ao confirmar) e adicionar um filtro rápido "Cartões".
- Nas Conexões, mostrar contagem de pendências por conta Pluggy, incluindo as de cartão, para o cartão deixar de ficar invisível.

### 3. Trazer o histórico do cartão
- Reaproveitar o backfill existente da Pluggy para promover os lançamentos brutos anteriores do cartão para a fila de conciliação, com faixa de datas escolhida pelo usuário e sem duplicar o que já foi conciliado (dedupe por `provider_id` já existente).

## Detalhes técnicos

- `src/pages/ConciliacaoPluggy.tsx`: resolução de escopo hoje faz `pluggy_accounts.eq('linked_account_id', scopedLocalAccountId)`; adicionar caminho alternativo por `linked_credit_card_id` (novo parâmetro de query, ex.: `?card=`), mantendo o comportamento atual para contas.
- `src/pages/CartoesCredito*`: ação por cartão navegando para a conciliação com o novo parâmetro.
- `src/pages/ConexoesPluggy.tsx`: agregação de pendências por `pluggy_account_id`, incluindo `type = 'CREDIT'`.
- Backfill: usar o fluxo/diálogo de backfill Pluggy já existente para o item do BMG, promovendo o intervalo antigo para `pluggy_staging_transactions`.
- Sem mudanças no worker de sincronização: ele já grava contas e lançamentos de cartão corretamente.

## Observação sobre o congelamento

Existe um congelamento de release ativo. Estes ajustes são de frontend/consulta e podem entrar como correção pontual, ou aguardar o fim da certificação — diga qual preferir.
