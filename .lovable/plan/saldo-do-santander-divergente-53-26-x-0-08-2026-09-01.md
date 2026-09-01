# Saldo do Santander divergente (-53,26 x 0,08)

## O que já está confirmado

- A conta "Banco Santander" (***8329) não tem nenhum lançamento no 360°FOOD; o saldo exibido é integralmente o que veio do Open Finance.
- Na leitura das 20:07 de hoje, o retorno do banco trouxe `balance: -53.26` e `bankData.closingBalance: -53.26`, com `automaticallyInvestedBalance: 0.08` e nenhum limite de cheque especial.
- O app espelha exatamente o campo `balance` do banco na criação e nas sincronizações seguintes.

Ou seja: o número não foi calculado pelo app. Mas se o saldo real é 0,08, o valor que estamos espelhando não representa o saldo atual da conta — e isso ainda não está diagnosticado (o `closingBalance` do Santander pode ser saldo de fechamento do dia anterior, ou a leitura pode ter vindo antes do resgate automático da ContaMax). Não vou afirmar a causa sem confirmar.

## Passo 1 — Confirmar o que o banco devolve agora (antes de qualquer código)

1. Forçar uma nova leitura da conexão Santander (o banco permite uma atualização por hora; a última foi 20:07) e registrar os valores crus: `balance`, `closingBalance`, `automaticallyInvestedBalance`, saldos reservados e a data/hora da leitura.
2. Comparar com o saldo que você vê no app do Santander no mesmo momento.

Resultados possíveis:

- **Volta 0,08** → era leitura desatualizada. Correção: sincronizar o saldo com mais frequência e mostrar na tela a data/hora da última leitura, para não parecer erro do app.
- **Continua -53,26** → o campo do Santander não é o saldo disponível. Correção: escolher a fonte certa por banco (por exemplo considerar o saldo aplicado automaticamente / saldo disponível em vez do saldo de fechamento) e passar a gravar esse valor.

## Passo 2 — Correção conforme o resultado

- Ajustar a origem do saldo na sincronização (`pluggy-sync-item`), guardando também a data/hora da leitura já existente no cadastro da conta.
- Cobrir com teste unitário o cálculo do saldo a partir do retorno do banco, incluindo o caso Santander com saldo aplicado automaticamente.
- Não alterar lançamentos: a correção é só do saldo espelhado.

## Passo 3 — Enquanto isso, destravar seu caso

- Corrigir o saldo desta conta para **0,08** usando o ajuste de saldo já existente na tela de Contas Bancárias, para o painel voltar a ficar certo hoje.
- Se a próxima sincronização sobrescrever de novo com -53,26, isso já é a evidência do Passo 1 e seguimos para a correção definitiva.

## Detalhes técnicos

- Origem do valor: `supabase/functions/pluggy-sync-item/index.ts` (`ofBalance = acc.balance`), gravado em `accounts.initial_balance/current_balance` na criação e via `sync_of_account_balance` nas atualizações.
- Espelho cru para auditoria: `pluggy_v2_accounts.raw_snapshot` (guarda `bankData` completo) e `accounts.bank_balance/bank_balance_at/bank_balance_source`.
- A exibição da data da última leitura usa `bank_balance_at`, já preenchido.
