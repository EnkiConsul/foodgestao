# Detalhes dos lançamentos dentro da fatura do cartão

Hoje cada fatura em Cartões de Crédito mostra só o mês, o status, as datas de fechamento/vencimento e o valor total. Os lançamentos que compõem esse total não aparecem — para vê-los é preciso ir até a tela de Lançamentos.

## Como vai ficar

1. Cada fatura passa a ser expansível: um clique na linha da fatura (com seta indicando abrir/fechar) revela os lançamentos daquele ciclo, logo abaixo do cartão.
2. Para cada lançamento são exibidos:
   - data da compra
   - descrição
   - categoria
   - fornecedor/cliente, quando houver
   - parcela (ex. 2/6), quando houver
   - valor, com sinal correto (compras como saída, estornos/créditos como entrada)
3. Rodapé do detalhamento: quantidade de lançamentos, soma exibida, rotativo anterior (quando existir) e o total da fatura — para conferir de onde vem o valor.
4. Clicar em um lançamento abre a edição do mesmo lançamento (o mesmo formulário usado na tela de Lançamentos).
5. Fatura sem lançamentos: mensagem curta "Nenhum lançamento nesta fatura".
6. Os valores respeitam o modo privacidade (R$ ••••), como no resto da tela.
7. Os lançamentos são buscados apenas quando a fatura é aberta (sem peso na carga inicial da página) e ficam em cache até recarregar.

## Detalhes técnicos

- `src/pages/CartoesCredito.tsx`: cada item de fatura vira um bloco colapsável (`Collapsible` do shadcn), com estado `expandedInvoiceId` e cache `txByInvoice: Record<string, Row[]>`.
- Busca: `transactions` filtrando por `credit_card_invoice_id = inv.id`, ordenado por `transaction_date`, trazendo `description, amount, transaction_type, transaction_date, installment_number, installment_total, is_invoice_payment`, mais `categories(name)` e `contacts(name)`; o escopo já é garantido pelas políticas de acesso e pelo cartão selecionado.
- Novo componente `src/components/credit-cards/InvoiceTransactionsList.tsx` para a lista e o rodapé de conferência, mantendo a página enxuta.
- Edição: reutilizar o diálogo de lançamento existente (`TransactionFormDialog`) na própria página, recarregando faturas e a lista aberta ao salvar.
- Sem migração de banco e sem mudanças em conciliação, fechamento de fatura ou cálculo de saldo — apenas leitura e apresentação.
- Testes: unitário do resumo do detalhamento (soma dos lançamentos, rotativo anterior, sinal de estorno) em `src/test/unit/`.
