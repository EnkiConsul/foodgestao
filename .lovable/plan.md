# Descrição do cartão na conciliação: o que os dados mostram

## Resposta curta

Não estamos lendo o campo errado. Conferi as linhas atuais do cartão (CARTAO BARCELONA / BMG) e o próprio Open Finance manda o código da operação no lugar do estabelecimento:

- `description`: `CREDITO_A_VISTA`
- `descriptionRaw`: `CREDITO_A_VISTA` (idêntico, não há texto melhor escondido aqui)
- `merchant`: `null`
- `paymentData`: `null`
- `operationType` / `providerCode`: `null`
- Único extra útil: `creditCardMetadata` (`cardNumber` 0038/6336, `billId`, `feeType: OTHER`) e a categoria do Pluggy (`Shopping`, `Digital services`)

Nossa exibição já usa `description`/`descriptionRaw` (os únicos campos textuais que a Pluggy entrega) e, quando é só código, monta o rótulo legível com categoria e final do cartão. Ou seja: a diferença em relação ao extrato do banco vem da origem — o BMG não publica o nome do estabelecimento na API de transações de cartão, mesmo que mostre no app/fatura dele.

Outras linhas do mesmo cartão vêm corretas (`PONTO DA CARNE GOIANIA BR`, `CONCEBRA GOIANIA BR`), o que confirma que quando o banco manda o estabelecimento nós exibimos.

## O que proponho fazer

### 1. Confirmar na fonte (diagnóstico, sem alterar dados)
- Ler direto da API da Pluggy as transações desse cartão (endpoint de transações e o de faturas/`bills` do `billId`) e comparar campo a campo com o que gravamos.
- Objetivo: comprovar se existe qualquer campo com o estabelecimento que hoje ignoramos (ex.: item de fatura, `merchant` preenchido só na fatura). Se existir, passamos a usá-lo com prioridade sobre `description`.
- Resultado do diagnóstico registrado em nota curta para você decidir o passo seguinte.

### 2. Se a Pluggy realmente não tiver o nome
- Manter o rótulo legível atual (`Compra no crédito à vista • Serviços digitais • cartão ••••0038`) e deixar explícito na linha que o banco não informou o estabelecimento.
- Permitir editar a descrição na linha e **memorizar** essa edição: quando outra linha do mesmo cartão tiver o mesmo `providerId`/mesmo valor recorrente já identificado antes, sugerir a descrição aprendida (mesma lógica de sugestão por histórico já usada em fornecedor).
- Descrição editada manualmente nunca é sobrescrita por nova sincronização.

### 3. Se a Pluggy tiver o nome em outro campo
- Ajustar a ordem de prioridade na gravação (`merchant.name` > item de fatura > `descriptionRaw` > `description`) e rodar um reprocessamento das linhas pendentes desse cartão para corrigir as descrições já baixadas, sem tocar em lançamentos confirmados.

## Detalhes técnicos

- Leitura de diagnóstico via função existente de integração Pluggy (chamada autenticada com a credencial já configurada), comparando `GET /transactions?accountId=...` e `GET /bills`/itens da fatura `ccf94919-…` com `pluggy_staging_transactions.raw`.
- Gravação: `supabase/functions/_shared/tx-description.ts` (prioridade de campos) e `supabase/functions/pluggy-sync-item/index.ts` (passar o item de fatura quando existir).
- Exibição: `src/lib/conciliacao/cardDescription.ts` já centraliza o rótulo; a memória de descrição entra como sugestão em `src/pages/ConciliacaoPluggy.tsx`.
- Sem migração de banco na etapa 1. A etapa 2/3 pode exigir uma tabela leve de descrições aprendidas por cartão — decidido após o diagnóstico.
- Release freeze ativo: a etapa 1 é somente leitura; as etapas 2 e 3 precisam da sua confirmação para entrar como correção.
