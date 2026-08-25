# Diferenciar contas com o mesmo nome em Contas Bancárias

## O que está acontecendo

Não há duplicidade: a conexão Open Finance do BTG trouxe duas contas correntes distintas para a mesma empresa:

- BTG Investimentos — conta 00228339-4 — saldo R$ 44,79
- BTG Investimentos — conta 00454363-9 — saldo R$ 0,00

Como a lista mostra apenas o nome do banco, elas parecem iguais.

## O que fazer

1. Exibir agência/número da conta como subtítulo em cada cartão/linha da tela Contas Bancárias, reutilizando o rótulo já criado para os seletores de cartão (`getAccountPaymentLabel` em `src/lib/accounts/accountLabels.ts`).
2. Quando o número não existir, manter apenas o nome (sem texto vazio ou "•" solto).
3. Destacar visualmente quando duas contas ativas compartilham o mesmo nome, com uma dica curta indicando que são contas diferentes vindas do Open Finance.

## Detalhes técnicos

- Alterações restritas à apresentação: `src/pages/ContasBancarias.tsx` e o componente de item de conta usado por ela.
- Sem migrações e sem mudanças no motor de saldos ou na sincronização.
