# Descrição dos lançamentos do cartão na conciliação

## O que está acontecendo

Não é perda de informação nossa: para as faturas do cartão, o banco (via Open Finance) manda um código de operação no lugar do nome do estabelecimento. Verificado nos dados atuais do cartão:

- `CREDITO_A_VISTA` em 8 linhas pendentes (R$ 34,90, R$ 9,99, R$ 19,99, R$ 26,90, R$ 2,93, R$ 4,61, R$ 0,62, -R$ 146,68), com `merchant: null` e `paymentData: null`. O único dado extra é `creditCardMetadata` (`cardNumber`, `payeeMCC`, `billId`) e a categoria do Pluggy (ex.: "Digital services").
- Outras linhas do mesmo cartão vêm corretas, com o estabelecimento: `PONTO DA CARNE GOIANIA BR`, `CONCEBRA GOIANIA BR`, `JERIVA COMERCIO DE ALI ABADIANIA BR`, `ModernMarket GOIANIA BR`.
- O enriquecimento atual (`_shared/tx-description.ts`) só trata rótulos genéricos de Pix/TED/DOC e depende de `merchant`/`paymentData`, que aqui não existem. Por isso `CREDITO_A_VISTA` passa direto.

Ou seja: o nome do estabelecimento não veio do banco nessas linhas. O que podemos (e devemos) melhorar é transformar o código em algo legível e útil, e deixar claro que a identificação precisa ser complementada.

## Ajuste proposto

1. Traduzir os códigos de operação de cartão para rótulo em português, no lugar de exibir `CREDITO_A_VISTA`:
   - `CREDITO_A_VISTA` → "Compra no crédito à vista"
   - `CREDITO_PARCELADO` / `PARCELA` → "Compra parcelada"
   - `PAGAMENTO_RECEBIDO` / `Pagamento recebido` → "Pagamento da fatura"
   - `TARIFA`, `ENCARGOS`, `JUROS`, `IOF`, `ANUIDADE`, `ESTORNO`, `SAQUE` → rótulos equivalentes
   - Código desconhecido: manter o texto original, apenas com underscores trocados por espaço e caixa mista.
2. Complementar o rótulo com o que existe de fato no dado bruto, quando houver:
   - final do cartão (`creditCardMetadata.cardNumber`, quando diferente de `0000`) → "• cartão ••••0038";
   - categoria do Pluggy traduzida (ex.: "Digital services" → "Serviços digitais"), quando a descrição não tiver estabelecimento.
   - Resultado típico: `Compra no crédito à vista • Serviços digitais • cartão ••••0038`.
3. Limpar o espaçamento das descrições que já trazem estabelecimento (`PONTO DA CARNE           GOIANIA      BR` → `PONTO DA CARNE • GOIANIA`), mantendo o nome intacto.
4. Aplicar em dois pontos, para não depender de nova sincronização:
   - **exibição** na conciliação e no extrato de conciliação (as 8 linhas pendentes já melhoram na hora);
   - **gravação** nas próximas sincronizações, para o lançamento nascer com a descrição boa.
5. Deixar sinalizado na linha que a descrição veio sem estabelecimento (dica curta "banco não informou o estabelecimento"), já que nesses casos o fornecedor precisa ser escolhido/cadastrado manualmente. A edição manual de descrição já existente continua valendo e nunca é sobrescrita.

## Detalhes técnicos

- Novo utilitário `src/lib/conciliacao/cardDescription.ts`: `cardOperationLabel(code)`, `formatProviderDescription(desc, raw)` e `hasMerchantName(desc)` — puro, sem dependência de rede.
- `supabase/functions/_shared/tx-description.ts`: reconhecer códigos de cartão como "genéricos" e montar o rótulo usando `creditCardMetadata` + `category` quando não há `merchant`/`paymentData`. Sem alterar o comportamento atual de Pix/TED/DOC.
- `src/pages/ConciliacaoPluggy.tsx` e `src/pages/ExtratoConciliacao.tsx`: usar o formatador na exibição da descrição (mantendo `description` do banco no dado e na edição manual).
- Testes: unitários do formatador em `src/lib/conciliacao/__tests__/cardDescription.test.ts` (código conhecido, desconhecido, com/sem final de cartão, descrição com estabelecimento) e casos de cartão em `supabase/functions/_shared/tx-description_test.ts`.
- Sem migração de banco. Não altera valor, data, direção, roteamento para fatura, nem lançamentos já confirmados.
- Observação: o release freeze está ativo; este ajuste é de exibição/descrição e precisa da sua confirmação para entrar como correção.

## Verificação

- Abrir a conciliação do cartão e conferir que as 8 linhas `CREDITO_A_VISTA` passam a exibir o rótulo legível com final do cartão.
- Conferir que as linhas com estabelecimento (PONTO DA CARNE, CONCEBRA, JERIVA) continuam com o nome original, só com espaçamento limpo.
