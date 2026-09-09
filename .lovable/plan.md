# Rolagem ao salvar e pendência de quem foi desligado

Dois ajustes na importação de documentos do Pessoas 360°.

## 1. A tela desce sozinha quando você salva

Hoje, ao tocar em "Aprovar e Salvar documentos", o quadro de progresso aparece acima do botão e pode ficar fora da vista, dando a sensação de que nada aconteceu.

- Assim que o salvamento começa, a tela rola suavemente até o quadro "Salvando documentos", com a contagem de documentos gravados.
- Vale tanto na conferência dentro da lista de lotes quanto na conferência em tela cheia.
- Se a pessoa rolar por conta própria durante o salvamento, o sistema não insiste.

## 2. Falta da Karine passa a virar pendência

Verificado no cadastro: a Karine foi admitida em 07/05/2026 e desligada em 02/07/2026, ou seja, estava no quadro em julho/2026 e por isso a conferência do lote apontou o documento faltando. Já o quadro de Conferência de Documentos (o que lista as pendências) só olha quem está ativo hoje — então, depois de salvar o lote, a falta dela desaparecia da lista em vez de virar pendência.

O que muda:

- O quadro de pendências passa a considerar também quem foi desligado, desde que a pessoa estivesse no quadro na competência analisada (mesma regra que a conferência do lote já usa: entre a admissão e o desligamento).
- Fora dessas competências, quem já saiu não gera pendência nenhuma — nada de cobrar contracheque de mês em que a pessoa não trabalhava.
- Quem foi desligado aparece na lista com a marca "desligado em dd/mm", para o gestor entender o contexto.
- O aviso "Faltam documentos de N colaborador(es)" antes de salvar passa a dizer que as faltas continuarão registradas como pendência.

## Detalhes técnicos

- `src/components/dp/documentos/BulkReviewInline.tsx` e `BulkReviewDialog.tsx`:
  - `savingBannerRef` no container do `BulkProgressBanner` com `phase="saving"`.
  - Após `setIsSaving(true)` em `runApprove`, um `requestAnimationFrame` faz `scrollIntoView({ behavior: "smooth", block: "start" })` uma única vez por salvamento.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`:
  - A consulta de colaboradores deixa de filtrar `ativo = true` e passa a trazer `ativo` + datas; a elegibilidade por competência usa `ativoNaCompetencia` de `src/lib/dp/bulk-coverage.ts` (fonte única da regra, já testada).
  - Alertas e contagem de elegíveis passam a carregar `desligamento` para exibir o selo.
  - Alertas de férias continuam restritos a quem está ativo.
- `ConfirmarFaltantesDialog.tsx`: texto reforçando que as faltas viram pendência.
- Sem migração, sem alteração de RLS, permissões ou motor de leitura de PDF.

## Verificação

- Typecheck e suíte de testes de DP, com caso puro para "desligado no meio da competência ainda gera pendência".
- Conferência visual em 360 px e 1280 px: salvar um lote e ver a tela subir para o progresso; confirmar a Karine listada em Falta Importar de julho/2026 após o salvamento.
