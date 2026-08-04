# Sugestão automática de forma de pagamento na conciliação

## O que acontece hoje

Ao carregar a fila de conciliação, o sistema já pré-seleciona a **conta de destino** e a **categoria** sugerida, mas o campo **Forma de pagamento** sempre começa vazio — não existe nenhuma regra de inferência. O usuário precisa escolher manualmente em cada lançamento.

Os dados do banco já trazem a informação necessária. Nos lançamentos importados desta empresa aparecem, por exemplo:

- `PIX ENVIADO SANEAGO` com meio de pagamento informado pelo banco = **PIX**
- `PAGAMENTO DE BOLETO OUTROS BANCOS` = **BOLETO**
- `PAGAMENTO CARTAO CREDITO BCE ... CARTAO MASTER` = **OTHER** (o meio real só aparece no texto)
- `APLICACAO CONTAMAX` / `TARIFA AVULSA ENVIO PIX` = **OTHER**

E a empresa já tem cadastradas as formas: Pix, Boleto, Cartão de Crédito, Cartão de Débito, Transferência / TED, Dinheiro, Vale Alimentação / Refeição, iFood, Cheque.

## O que será feito

1. Criar um pequeno motor de inferência que, para cada lançamento importado, deduz a forma de pagamento a partir de:
   - o meio de pagamento informado pelo banco (PIX, BOLETO, TED, DOC, CARD/quando disponível);
   - quando o banco não informa (OTHER), palavras-chave da descrição: `PIX`, `BOLETO`, `TED`/`TRANSFERENCIA`/`DOC`, `CARTAO CREDITO`, `CARTAO DEBITO`/`COMPRA CARTAO`, `DINHEIRO`/`SAQUE`/`DEPOSITO`, `IFOOD`, `CHEQUE`.
2. Casar o resultado com as formas de pagamento **da empresa selecionada** por nome (tolerante a acento, maiúsculas e variações como "Transferência / TED"). Se a empresa não tiver aquela forma cadastrada, o campo continua vazio.
3. Pré-selecionar essa sugestão no carregamento da fila, tanto na tabela (desktop) quanto nos cards (mobile), do mesmo jeito que já ocorre com conta e categoria:
   - a escolha manual do usuário sempre prevalece;
   - rascunhos salvos (localStorage) prevalecem sobre a sugestão;
   - lançamentos sem inferência confiável ficam em branco (sem "adivinhar" errado).
4. Exibir a sugestão como um rótulo discreto "sugerido" ao lado do seletor, para o usuário saber que pode revisar.
5. Cobrir o motor de inferência com testes unitários (casos PIX, boleto, cartão, TED, tarifa, aplicação, sem match).

## Detalhes técnicos

- Novo arquivo `src/lib/conciliacao/paymentMethodInference.ts` com `inferPaymentMethodKey(row)` (retorna uma chave canônica: `pix | boleto | ted | credito | debito | dinheiro | ifood | cheque | null`) e `matchPaymentMethodId(key, paymentMethods)` para resolver o id pelo nome cadastrado.
- Fonte dos dados: colunas já existentes em `pluggy_staging_transactions` (`raw->paymentData->paymentMethod`, `description`, `category_pluggy`, `type`). Nenhuma mudança de banco de dados é necessária.
- `src/pages/ConciliacaoPluggy.tsx`: no `load()`, ao montar `rowPayment`, aplicar `draft.rowPayment[id] ?? sugestão`. A lista `paymentMethods` já é carregada filtrada por empresa.
- Testes em `src/lib/conciliacao/__tests__/paymentMethodInference.test.ts`.
- Nenhuma alteração na RPC `pluggy_confirm_staging` — ela já aceita `p_payment_method_id`.
