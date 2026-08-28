# Aviso "Fila do cartão de crédito Sem nome"

## Por que a mensagem aparece

Esse aviso é intencional: ele avisa que você abriu a conciliação com o escopo de um **cartão de crédito** (URL `?card=...`), e não de uma conta bancária — os lançamentos confirmados nessa fila vão para a fatura do cartão, não para o saldo de uma conta.

O que está errado é apenas o **nome**. O rótulo usa o nome da conta que veio do Open Finance, e para esse cartão a integração gravou literalmente `Sem nome` (cartão NEON, final 4103, com 14 lançamentos pendentes). O cadastro local do cartão tem os dados corretos (emissor NEON, final 4103, titular), mas a tela não os usa.

## Ajuste proposto

1. No aviso da conciliação, montar o rótulo do cartão a partir do cadastro local: `NEON •••• 4103`. Usar o nome vindo do Open Finance somente quando ele existir e não for um placeholder (`Sem nome`, vazio, `-`).
2. Se nem o cadastro local nem a integração tiverem nome utilizável, exibir o aviso sem nome ("Fila do cartão de crédito — os lançamentos confirmados vão para a fatura do cartão."), sem a palavra "Sem nome".
3. Aplicar o mesmo tratamento ao subtítulo do Extrato de Conciliação, que hoje também mostraria `Sem nome`.

## Detalhes técnicos

- `src/pages/ConciliacaoPluggy.tsx`: ao resolver o escopo por `?card=`, buscar também `credit_cards` (`issuer`, `last4`, `brand`) e guardar em `ScopeInfo.name` o rótulo já normalizado; helper de placeholder para descartar `Sem nome`.
- `src/pages/ExtratoConciliacao.tsx`: mesma normalização no `accountName` quando `?card=` está presente.
- Sem mudanças no banco, no worker de sincronização ou na lógica de roteamento para faturas.
