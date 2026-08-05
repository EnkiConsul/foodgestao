# Descrição dos lançamentos na integração Pluggy

## Resposta curta

Sim, o campo usado é o correto — mas ele chega truncado em alguns bancos, e hoje não corrigimos isso.

## O que foi verificado

A sincronização usa `description` do Pluggy (com fallback para `descriptionRaw`) e, quando o banco devolve um rótulo genérico, monta uma descrição melhor com a contraparte. Nos dados atuais (433 lançamentos):

- 44 lançamentos já foram enriquecidos: `TRANSF ENVIADA PIX` virou `Pix enviado para EMPORIO ELDORADO MILAO LTDA`.
- `description` e `descriptionRaw` são idênticos em 100% dos casos, ou seja, não há um campo "melhor" sendo ignorado.
- Problema real: o Santander corta a descrição em ~30 caracteres. Exemplos gravados hoje:
  - `PIX ENVIADO   EMPORIO DAS CARNES GRANVI` (nome real: `EMPORIO ELDORADO MILAO LTDA`)
  - `PIX ENVIADO   BYTEDANCE BRASIL TECNOLOG` (nome real: `BYTEDANCE BRASIL TECNOLOGIA LTDA.`)
  - `PAGAMENTO DE BOLETO OUTROS BANCOS   FROHLICH INVESTIMENTOS E`
- Cuidado necessário: em créditos recebidos, o `merchant` do Pluggy às vezes traz a **própria empresa** (ex.: `ENKI CONSULTORIA LTDA` como merchant de um Pix recebido de `NAGASUBIAS CORPORATE LTDA`). Portanto não se pode simplesmente preferir `merchant`.

## O que fazer

1. Detectar descrição truncada: quando a descrição do banco termina com um prefixo do nome da contraparte externa (comparação normalizada, sem acento/caixa) ou está cortada no meio de uma palavra, substituir pelo nome completo, mantendo o rótulo da operação — `PIX ENVIADO   EMPORIO ELDORADO MILAO LTDA`.
2. Escolher a contraparte pelo mesmo critério já usado na conciliação: lado externo (`payer` em entradas, `receiver` em saídas), descartando documentos/nome da própria empresa antes de considerar `merchant`.
3. Se a descrição do banco não tiver relação com o nome da contraparte, preservar a descrição original (nada de sobrescrever informação boa).
4. Cobrir com testes unitários os casos: truncado, completo, genérico, merchant igual à própria empresa e sem contraparte.
5. Manter os lançamentos já gravados como estão; a melhoria vale para as próximas sincronizações (opcionalmente um reprocessamento pontual do `raw` já salvo, se desejado).

## Detalhes técnicos

- `supabase/functions/_shared/tx-description.ts`: estender `buildDescription` com a lógica de truncamento e o filtro de "própria empresa"; reutilizar a normalização de nomes.
- `supabase/functions/pluggy-sync-item/index.ts`: passar a lista de documentos/nomes da própria empresa (já calculada como `ownDocuments`) para o builder.
- Testes em `supabase/functions/_shared/__tests__/tx-description.test.ts` (ou local equivalente ao padrão do projeto).
