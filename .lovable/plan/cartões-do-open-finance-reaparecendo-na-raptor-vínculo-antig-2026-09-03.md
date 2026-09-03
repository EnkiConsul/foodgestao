# Cartões do Open Finance reaparecendo na Raptor (vínculo antigo)

## Confirmação do que existe hoje

Confirmado: são resíduos de conexões antigas da Raptor, sem nada em uso.

- BMG (final 2691), Neon (4103) e C6 (2555) na Raptor: **nenhuma conta local vinculada** (`linked_account_id` vazio nas seis linhas espelhadas) e **zero lançamentos** apontando para essas contas. Ou seja, as contas e os lançamentos realmente já foram excluídos.
- A conexão do C6 já está marcada como excluída; as do BMG e Neon continuam ativas ("updated") e voltaram a sincronizar ontem/hoje (18:10 e 18:37).
- Nessa nova leitura, o banco emitiu **novos códigos de conta para os mesmos cartões**, criando linhas novas na fila "cartão de crédito detectado" — é isso que você vê na Raptor. Os cartões continuam cadastrados apenas na Familia.

Portanto há dois problemas reais: a conexão sobrevive à exclusão das contas e volta a espelhar; e a decisão anterior do usuário (ignorar) não acompanha o cartão quando o código da conta muda.

## O que será feito

1. **Excluir os resíduos da Raptor** — remover as conexões BMG, Neon e C6 da Raptor junto com as linhas espelhadas e o extrato pendente delas. Como não há conta local nem lançamento ligado, nada em uso é afetado; a Familia não é tocada.

2. **Excluir a conta local encerra a conexão daquela conta** — quando a última conta/cartão de uma conexão for excluída na empresa, a conexão daquela empresa passa a ser encerrada também (em vez de ficar ativa e voltar a espelhar na próxima sincronização).

3. **A decisão do usuário passa a valer para o cartão, não para o código do provedor** — ao detectar um cartão, herdar a decisão anterior da mesma empresa pelo par banco + últimos 4 dígitos: se já foi ignorado, entra ignorado; se já foi vinculado, herda o vínculo. Assim ele não volta para a fila a cada reautenticação.

4. **Aviso de cartão de outra empresa** — na fila de cartões detectados e no diálogo de autorização, quando o cartão corresponder a um cartão já cadastrado em outra empresa do usuário, mostrar: "Este cartão já está cadastrado na empresa Familia — confirme se esta conexão bancária deveria estar nesta empresa."

5. **Ação para remover conexão da empresa errada** — em Contas Financeiras, "Remover esta conexão desta empresa", com confirmação explicando que a conexão e o extrato pendente saem e que lançamentos confirmados permanecem.

6. **Validar** — com Raptor selecionada, a fila de cartões detectados fica vazia; após uma nova sincronização, os cartões não voltam; com Familia selecionada, os três cartões e as faturas seguem intactos.

## Detalhes técnicos

- Limpeza de dados: apagar `pluggy_staging_transactions`, `pluggy_accounts` e `pluggy_connections` dos itens `069d4aa1…` (BMG), `2f9eb17b…` (Neon) e `e8048082…` (C6) da empresa Raptor Systems, e encerrar o item correspondente na Pluggy pela rotina existente (`pluggy-pause-or-delete`) para parar de gerar sincronização.
- `delete_account` / fluxo de exclusão de conta: ao remover a última conta/cartão vinculado de uma conexão naquela empresa, marcar a conexão como excluída e limpar o espelho/staging pendente.
- `supabase/functions/pluggy-sync-item/index.ts`: na etapa de espelhamento CREDIT, ampliar a herança para considerar `credit_review_status IN ('ignored','linked')` por `number_masked` (+ conector) na mesma empresa; manter `onConflict: 'pluggy_account_id'`. Não espelhar contas de conexões com status `deleted`.
- Nova função no banco (`security definer`, restrita às empresas do usuário) que, dado banco + final, devolve apenas o **nome da empresa** onde o cartão já está cadastrado — sem expor dados do cartão.
- `usePluggyCreditReview` traz o aviso de duplicidade junto de cada pendência; `PluggyCreditCardReviewDialog` exibe o alerta.
- Sem mudança em saldo, fechamento de fatura, conciliação ou lançamentos confirmados.
