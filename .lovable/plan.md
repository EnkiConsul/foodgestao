# Conferência de Documentos: incluir o contracheque

## Por que o contracheque não aparece

A Conferência de Documentos, hoje, só olha dois documentos: **Folha de Ponto** e **Adiantamento Salarial**. Contracheque simplesmente não entra na conta — nem na unidade Pakerê T-63, nem na Garavelo.

Além disso, o painel só cobra um documento quando o cadastro do colaborador marca o campo correspondente ("possui folha de ponto", "optante de adiantamento"). O único colaborador ativo da T-63 está com os dois desmarcados, por isso a unidade fica completamente silenciosa.

Situação atual dos contracheques importados: 05/2026 (12) e 06/2026 (10). Não há contracheque de 07/2026 — que é a última competência fechada — e nenhum contracheque para o colaborador da T-63.

## O que muda

1. **Contracheque passa a ser conferido** junto de Folha de Ponto e Adiantamento, nas mesmas 6 últimas competências fechadas.
2. **Contracheque é esperado de todo colaborador assalariado ativo no mês**, sem depender de campo no cadastro: regimes CLT, intermitente, temporário e aprendiz. Regimes PJ/MEI/freelancer ficam fora (não recebem contracheque).
3. O agrupamento continua igual ao de hoje: por competência, tipo e unidade, com "lote completo pendente na <unidade>" quando ninguém da unidade tem o documento, e lista de nomes quando a pendência é parcial.
4. Inconsistência (documento importado para quem não deveria ter) segue valendo para Ponto e Adiantamento; para contracheque não faz sentido, então só se aplica a PJ/MEI/freelancer com contracheque importado.
5. O painel continua não exibindo unidades sem pendência esperada, conforme sua escolha.

Resultado prático: a T-63 passa a sinalizar contracheque pendente (07/2026 e meses anteriores desde a admissão do colaborador), e a Garavelo passa a mostrar o lote completo de contracheque de 07/2026.

## Detalhes técnicos

- `src/components/dp/documentos/DocConsistenciaPanel.tsx`
  - `Tipo` passa a incluir `"contracheque"`; `TIPO_LABEL` recebe "Contracheque".
  - A consulta de `dp_documentos` inclui `contracheque` no `.in("tipo", ...)`.
  - A consulta de `dp_colaboradores` passa a trazer `regime`.
  - Regra de elegibilidade: `contracheque` esperado quando `regime` ∈ {clt, intermitente, temporario, aprendiz}; a checagem de admissão/desligamento por competência permanece a mesma.
  - Ordenação dos grupos ganha o contracheque na frente (contracheque → ponto → adiantamento).
- Nenhuma migração de banco e nenhuma alteração no fluxo de importação.
