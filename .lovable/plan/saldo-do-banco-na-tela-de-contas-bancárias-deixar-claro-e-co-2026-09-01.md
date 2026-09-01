# Saldo do banco na tela de Contas Bancárias: deixar claro e corrigir a fonte

## O que está confirmado agora

- A sincronização busca o saldo do banco em toda leitura. A última leitura da conta Santander (***8329) foi hoje às 22:02 e o Santander devolveu novamente `balance: -53.26` / `bankData.closingBalance: -53.26`.
- No mesmo retorno vem `automaticallyInvestedBalance: 0.08`, sem nenhum indício de descoberto (`overdraftContractedLimit: 0`, `overdraftUsedLimit: 0`, `unarrangedOverdraftAmount: 0`).
- O saldo oficial da conta no app está `0,08` (correto). O `-53,26` fica guardado apenas como referência do banco, e o `(-53,34)` exibido é a diferença entre essa referência e o saldo do app.

Ou seja: a linha laranja não é saldo desatualizado nem cálculo do app — é o próprio Santander repetindo esse valor. Falta (a) a tela dizer isso com clareza e (b) escolher o campo certo desse retorno.

## 1. Deixar claro na tela

- Trocar o rótulo `Banco: ...` por `Saldo do banco · última leitura 01/09 22:02`, usando a data já gravada na conta.
- Quando o valor do banco foi **descartado por ser implausível** (negativo em conta corrente sem cheque especial), usar cor neutra em vez de laranja e explicar no tooltip: "O banco informou -R$ 53,26, valor incompatível com uma conta sem cheque especial; o app mantém o seu saldo."
- Manter o laranja de divergência apenas quando a referência do banco é plausível e ainda difere do saldo do app.
- Mostrar a diferença apenas nesse caso plausível (hoje ela aparece também no caso descartado, que é justamente o que confundiu).

## 2. Investigar e corrigir a fonte do saldo no Santander

- Registrar, a cada leitura, os campos crus relevantes (`balance`, `closingBalance`, `automaticallyInvestedBalance`, reservados) para comparar leituras ao longo do dia e confirmar se o `closingBalance` do Santander é saldo de fechamento e não saldo disponível.
- Passar a resolver o saldo de referência por conector: para contas correntes cujo `closingBalance` seja negativo sem descoberto e que tenham `automaticallyInvestedBalance` positivo, considerar o saldo disponível como `closingBalance + automaticallyInvestedBalance` (no caso atual: `-53,26 + 0,08`), e só usar esse valor como referência do banco se ele fizer sentido; caso contrário seguir descartando.
- Se após duas ou três leituras o Santander mantiver os mesmos números, tratar como característica do conector e documentar no runbook do Open Finance, mantendo a regra por conector.
- O saldo oficial da conta continua sendo o do razão/ajuste do usuário: nenhuma alteração de lançamentos.

## 3. Testes

- Casos novos em `of-balance_test.ts`: Santander com `automaticallyInvestedBalance` positivo, conta corrente negativa sem investimento automático, conta com cheque especial.
- Teste de exibição da divergência cobrindo "referência descartada" (sem laranja, sem diferença) x "divergência real" (laranja com diferença).

## Detalhes técnicos

- Frontend: `src/pages/ContasBancarias.tsx` (bloco do `compareBankLedger`) e `src/lib/transactions/balance.ts` / helper de comparação, que passa a receber também o flag de referência descartada.
- Backend: `supabase/functions/_shared/of-balance.ts` (resolução por conector + saldo disponível), consumido por `supabase/functions/pluggy-sync-item/index.ts`; snapshot cru continua em `pluggy_v2_accounts.raw_snapshot`.
- Nenhuma migração de dados necessária; `accounts.bank_balance/bank_balance_at/bank_balance_source` já existem.
