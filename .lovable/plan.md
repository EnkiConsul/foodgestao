# Descrição do cartão: mostrar o texto do banco, sem reescrever

## O que está errado

Hoje o sistema **substitui** a descrição que o banco manda por um rótulo montado por nós, tanto na gravação quanto na exibição:

- Na sincronização (`pluggy-sync-item`), para contas de cartão, a descrição gravada vem de um rótulo inferido: código de operação traduzido, categoria/MCC, final do cartão e — pior — casamento por **valor absoluto** com os encargos da fatura. Foi assim que a linha de 2,93 do BMG virou "Multa Contratual • cartão ••••6336": é palpite por valor, não dado do lançamento.
- Na exibição (`formatProviderDescription`), o texto do banco é reformatado de novo (`PONTO DA CARNE           GOIANIA      BR` → `PONTO DA CARNE • GOIANIA`).

Resultado: em todos os cartões a coluna Descrição não bate com o extrato do banco.

Dado verificado: o texto original do banco está preservado em `raw.descriptionRaw` (Neon: `PONTO DA CARNE  GOIANIA  BR`, `CONCEBRA  GOIANIA  BR`, `Pagamento Fatura`; BMG: `CREDITO_A_VISTA`). Nada foi perdido — só está sendo sobrescrito na tela e na coluna `description`.

## Correção

1. **Descrição = texto do banco.** Passar a exibir e gravar exatamente `descriptionRaw` (ou `description`, quando `descriptionRaw` não vier), com uma única normalização: colapsar os blocos de espaços de alinhamento em espaço simples. Sem traduzir código, sem juntar categoria, sem final do cartão, sem "•".
2. **Remover o casamento com a fatura por valor.** As dicas de encargo (`Multa Contratual`, `IOF Rotativo`, `ENCARG FINANC FATURADOS`) deixam de virar descrição, porque a correspondência por valor não é confiável.
3. **Informação derivada vira apoio, não descrição.** Categoria/MCC, final do cartão e o rótulo legível do código de operação ficam disponíveis como texto auxiliar discreto na linha (segunda linha/tooltip), claramente separado da descrição do banco. Para `CREDITO_A_VISTA` continua o aviso curto "banco não informou o estabelecimento".
4. **Consertar o que já foi gravado.** Reprocessar apenas as linhas **pendentes** dos cartões, restaurando a descrição a partir de `raw`. Lançamentos confirmados e descrições editadas à mão não são alterados.
5. **Enriquecimento de conta bancária fica como está.** Pix/TED/DOC continuam ganhando o nome da contraparte — a mudança é restrita a lançamentos de cartão.

## Detalhes técnicos

- `supabase/functions/_shared/tx-description.ts`: remover o uso de `cardHints` na montagem da descrição de cartão e reduzir `buildCardDescription` a "texto do provedor normalizado"; manter `mccLabel`/`cardOperationLabel` exportados apenas para uso como rótulo auxiliar. Ajustar `tx-description_test.ts`.
- `supabase/functions/pluggy-sync-item/index.ts`: deixar de buscar faturas para montar `cardHints` (o `listBills` fica sem uso na sincronização; pode ser removido ou mantido só se algum outro fluxo usar).
- `src/lib/conciliacao/cardDescription.ts`: `formatProviderDescription` passa a devolver o texto do banco com espaços colapsados (mantendo cidade/país como no extrato); os rótulos derivados ganham função separada (`cardHintLabel`) para a linha auxiliar.
- `src/pages/ConciliacaoPluggy.tsx` e `src/pages/ExtratoConciliacao.tsx`: descrição do banco em primeiro plano; rótulo derivado em texto secundário.
- Reprocessamento: rodar a sincronização das conexões com cartão (fluxo existente, só atualiza linhas pendentes).
- Testes: atualizar `cardDescription.test.ts` (texto do banco preservado; `CREDITO_A_VISTA` sem enfeite) e os testes Deno correspondentes. Sem migração de banco.

## Observação

O release freeze segue ativo; esta é uma correção de conciliação (frontend + função de sincronização), sem alterar valor, data, direção ou lançamentos confirmados.
