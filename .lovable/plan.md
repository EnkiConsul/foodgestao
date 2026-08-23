# Aplicar a Conferência Mínima Obrigatória de Documentos

## Por que ainda não apareceu

O plano de 23/08 ("Conferência de Documentos Completa + Ajustes no Histórico") foi aplicado só em parte. As seções de Histórico (substituir/excluir com motivo, larguras, filtros), detecção de assinatura e aceite dispensado estão no ar. A **seção 1 — Conferência mínima obrigatória — não foi implementada**: o painel continua com os mesmos dois tipos de antes.

Estado atual verificado em `DocConsistenciaPanel.tsx`: só considera `ponto` e `adiantamento`, e só cobra quando o cadastro do colaborador tem a flag marcada. Contracheque, 13º e férias não entram na conta. Por isso a Pakerê T-63 — cujo único ativo (Nordman) está sem as duas flags — nunca sinaliza nada, e nenhuma unidade cobra contracheque, mesmo faltando o de 07/2026.

## O que será implementado agora

Regras de expectativa por competência (janela de 6 competências fechadas, como hoje):

| Documento | Quando é exigido |
| --- | --- |
| Contracheque mensal | Todo colaborador assalariado ativo na competência (CLT, intermitente, temporário, aprendiz). PJ/MEI/freelancer ficam fora |
| Contracheque 13º — 1ª parcela | Competência 11/AAAA, cobrado só depois de 30/11 |
| Contracheque 13º — 2ª parcela | Competência 12/AAAA, cobrado só depois de 20/12 |
| Contracheque de férias | Competência em que houve gozo de férias aprovado |
| Folha de ponto | Unidade com relógio de ponto **e** colaborador com folha de ponto marcada |
| Adiantamento salarial | Colaborador optante por adiantamento |
| Férias vencidas | Bloco próprio: período aquisitivo com saldo e limite concessivo vencido/próximo, sem gozo agendado |

Comportamento visual:

- Grupos seguem como hoje: por competência, tipo e unidade, com "lote completo pendente na <unidade>" quando ninguém tem o documento e lista de nomes quando a falta é parcial.
- 13º antes do prazo legal aparece como aviso "a vencer", não como pendência.
- O bloco "Férias vencidas sem agendamento" tem atalho para a tela de Férias.
- Unidades sem nada esperado continuam sem aviso, conforme sua escolha.
- Inconsistência (documento importado para quem não deveria ter) continua valendo para ponto e adiantamento, e passa a valer para contracheque de PJ/MEI/freelancer.

Resultado esperado: a T-63 passa a cobrar o contracheque do Nordman (07/2026 e meses anteriores desde a admissão) e a Garavelo mostra o lote completo de contracheque de 07/2026 pendente.

## Detalhes técnicos

- `src/components/dp/documentos/DocConsistenciaPanel.tsx`
  - `Tipo` passa a `contracheque | contracheque_13 | contracheque_ferias | ponto | adiantamento`; `TIPO_LABEL` atualizado.
  - Consulta de `dp_documentos` inclui os novos tipos no `.in("tipo", ...)`.
  - Consulta de `dp_colaboradores` passa a trazer `regime`; nova consulta de `dp_unidades.possui_relogio_ponto` para condicionar a folha de ponto.
  - 13º: diferencia 1ª/2ª parcela pela `referencia_data` (mês 11 e 12) e só entra em "faltando" após 30/11 e 20/12.
  - Contracheque de férias: cruza `dp_ferias_gozos` (status aprovado) para saber em quais competências é esperado.
  - Bloco de férias vencidas: `dp_ferias_periodos` com `dias_saldo > 0` e `limite_concessivo` vencido ou nos próximos 60 dias, sem `dp_ferias_gozos` agendado, com link para `/dp/ferias`.
  - Ordenação: contracheque → 13º → férias → ponto → adiantamento.
- Sem migração de banco e sem alteração no fluxo de importação; todas as leituras seguem por `company_id`.
