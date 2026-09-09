# Reconhecer pró-labore já na leitura do PDF

## Diagnóstico

A correção anterior só agia no momento de aprovar o documento. A leitura das páginas (`dp-doc-bulk-ingest`) classifica pela aparência do papel — e o recibo da Tamires é impresso como "Recibo de Pagamento", igual ao dos empregados. Por isso a página dela aparece na revisão como "Contracheque".

Verificado: a leitura busca os colaboradores sem trazer o vínculo (`vinculo_label`, `socio_remuneracao`), então nesse momento ela não tem como saber que a Tamires é sócia com pró-labore.

## O que muda

- Assim que a página é vinculada a uma pessoa, se essa pessoa é sócia remunerada por pró-labore, a natureza passa a ser gravada como **Recibo de Pró-Labore** — na tela de revisão já aparece assim, sem precisar corrigir à mão.
- Vale só para os papéis de pagamento mensal e de 13º. Ponto, adiantamento, férias e demais naturezas seguem como estão.
- A checagem de documento repetido passa a usar essa mesma natureza, evitando importar duas vezes o mesmo recibo.
- Empregados (CLT e afins) continuam classificados como contracheque.

## Detalhes técnicos

- `supabase/functions/dp-doc-bulk-ingest/index.ts`
  - Incluir `vinculo_label, socio_remuneracao` no `select` de `dp_colaboradores` e no tipo `Colab`.
  - Após resolver `match`, calcular `const tipoFinal = tipoCanonicoPorVinculo(tipoEfetivo, match)` usando o helper já existente `supabase/functions/_shared/doc-tipo-vinculo.ts`.
  - Usar `tipoFinal` na checagem de duplicidade, em `DOC_TIPO_EXIGE_ACEITE` e no campo `tipo_detectado` gravado no item.
  - O filtro de candidatos por `ponto` continua usando `tipoEfetivo` (a canonicalização depende do match, que vem depois).
- Reimplantar `dp-doc-bulk-ingest`.
- Testes: casos no arquivo já existente `src/lib/dp/__tests__/documento-tipo-por-vinculo.test.ts` cobrem a regra pura; typecheck e suíte de DP.
- Sem alterações de banco, RLS, permissões, ou do motor de OCR/IA.

## Lote de agosto já importado

O lote de agosto da T-63 que está em revisão será reprocessado? Não — para não mexer em páginas já revisadas, a natureza da página da Tamires nesse lote pode ser ajustada na própria tela de revisão (campo "Natureza"), e as próximas importações já sairão corretas. Se preferir, também posso reprocessar esse lote específico.
