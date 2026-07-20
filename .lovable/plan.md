## Causa

O seletor de conta em `TransactionFormDialog.tsx` desfaz a escolha do cartão de crédito imediatamente após o clique.

O efeito das linhas 206–210 revalida a `accountId` atual apenas contra a lista `accounts` (contas bancárias). Quando o usuário escolhe um cartão, o valor fica no formato sintético `cc:<uuid>`, que nunca existe em `accounts` → o efeito considera "não existe" e reseta para `accounts[0].id`, voltando para a primeira conta bancária. Visualmente parece que o cartão "não deixa ser selecionado".

## Correção

Ajustar a checagem para aceitar também IDs de cartão:

```ts
useEffect(() => {
  if (!open || transaction) return;
  const isCard = accountId.startsWith("cc:")
    && creditCards.some((c) => `cc:${c.id}` === accountId);
  const isAccount = accountId && accounts.some((a) => a.id === accountId);
  if (!isCard && !isAccount) setAccountId(accounts[0]?.id ?? "");
}, [open, transaction, accounts, creditCards, accountId]);
```

Nenhuma outra mudança é necessária — o restante do fluxo (payload com `credit_card_id`, trigger de alocação de fatura, RLS) já foi validado e funciona.

## Validação

- Abrir "Novo lançamento" em PJ → selecionar cartão Mastercard no seletor de conta → a seleção persiste e o banner de fatura aparece.
- Salvar como Despesa pendente → registro é criado e vinculado à fatura correta.
