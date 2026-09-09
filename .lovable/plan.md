# Intermitente sem dias trabalhados: sem folha de ponto na competência

## Situação verificada

Wanderson é intermitente, foi desligado em 01/08/2026 e, em agosto/2026, não tem nenhum dia de escala, nenhuma convocação e nenhuma marcação de ponto. Ainda assim o sistema cobra folha de ponto dele, porque hoje a regra só olha se a unidade tem relógio e se o cadastro está marcado com folha de ponto.

## O que muda

- Para quem é intermitente, folha de ponto e contracheque passam a ser cobrados só nas competências em que houve trabalho: dia de escala publicada, convocação aceita ou marcação de ponto no mês.
- Sem nenhum desses registros no mês, não aparece pendência nem alerta de falta — nem no Início, nem na Conferência de Documentos, nem na conferência do lote importado.
- A rescisão continua sendo cobrada normalmente na competência do desligamento (caso do Wanderson em agosto/2026).
- Regimes mensalistas (CLT, temporário, aprendiz) seguem exatamente como hoje.
- Quando o intermitente tem dias no mês, a cobrança volta a valer como antes.

## Detalhes técnicos

- `src/lib/dp/pendencias-documentos.ts`: `ElegibilidadeOpts` ganha `temDiasNaCompetencia?: boolean`; para `regime = intermitente`, `ponto` e `contracheque` retornam `false` quando o flag é `false`. Sem informação (`undefined`) o comportamento atual é preservado.
- `src/lib/dp/bulk-coverage.ts`: `CoverageArgs` recebe `comDiasTrabalhados?: Set<string> | null`; `computeCoverage` exclui dos esperados o intermitente ausente desse conjunto para os tipos `ponto` e `contracheque`.
- Novo hook `src/hooks/useDpDiasTrabalhados.tsx`: por empresa/competência, retorna o conjunto de `colaborador_id` com pelo menos um registro em `dp_escala_itens` (escala publicada), `dp_pontos` ou convocação aceita no intervalo da competência — consultado apenas para os intermitentes da lista, para não pesar.
- `src/hooks/useDpPendencias.tsx`: carrega o conjunto por competência e passa em `elegivelDocumento`; `DocConsistenciaPanel.tsx`, `BulkReviewInline.tsx` e `BulkReviewDialog.tsx` passam `comDiasTrabalhados` para `computeCoverage`.
- Testes em `src/lib/dp/__tests__`: caso Wanderson (agosto/2026 sem dias → sem pendência de ponto, com pendência de rescisão), intermitente com um dia no mês voltando a exigir folha de ponto, e CLT inalterado.
