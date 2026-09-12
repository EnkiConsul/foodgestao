# Pendência resolvida deve sair da tela de Início na hora

## O que está acontecendo hoje

Quando você resolve uma pendência (por exemplo, enviar o adiantamento salarial da unidade Garavelo), o sistema faz três coisas em sequência:

1. grava o documento;
2. marca as pendências da empresa como "desatualizadas";
3. só na próxima vez que a tela de pendências é lida é que a apuração completa da empresa roda no servidor e a lista nova aparece.

Como a lista do Início mantém o último quadro confirmado até a nova apuração terminar, o item resolvido continua visível durante todo esse recálculo — foi o que você viu, sumindo só depois de mais de um minuto.

Ainda não está medido quanto desse tempo é o recálculo no servidor e quanto é atraso do aviso entre telas. A primeira etapa do trabalho é medir isso, porque a correção certa depende do resultado.

## O que será feito

1. **Medir**: cronometrar a apuração de pendências da Pakerê e registrar o tempo, para saber se o gargalo é o recálculo no servidor ou a comunicação entre as telas.
2. **Baixa imediata do item resolvido**: ao concluir a ação, a pendência correspondente sai na hora da lista do Início e da lista completa, sem esperar a nova apuração. O contador e os selos (atrasado, urgente, hoje, próximo) são recalculados no mesmo instante.
3. **Um único caminho para avisar as telas**: criar uma rotina compartilhada usada por todas as ações que resolvem pendências (documentos enviados, importação em lote, adiantamento, licenças/atestados, férias, ocorrências, solicitações e trocas). Ela dá baixa do item, pede a nova apuração e atualiza a lista e o horário de "última atualização" quando termina.
4. **Sinalização honesta**: a setinha gira somente durante a apuração real e o horário de última atualização muda junto quando ela conclui.
5. **Se a apuração no servidor for o gargalo**: reduzir o recálculo para a parte afetada (empresa/unidade/competência) em vez de refazer tudo, mantendo a apuração completa apenas na rotina diária das 03:00.

## Detalhes técnicos

- Nova rotina `resolverPendencias(qc, { companyId, ids | filtro })` em `src/lib/dp/pendencias-cache.ts` (ou módulo irmão): remove os ids do cache React Query `["dp_pendencias", companyId]` e do snapshot em `localStorage`, depois chama `dp-refresh-pendencias` e invalida `["dp_pendencias", companyId]` e `["dp_pendencias_apuracao"]`.
- Substituir os `qc.invalidateQueries({ queryKey: ["dp_pendencias"] })` espalhados (`useDpDocumentos`, `useDpColaboradorDocumentos`, `useDpAdiantamentoSolicitacoes`, `useDpIntermitenteConfirmacoes`, `DpAtestados`, `DpLicencaRetornoDialog`, `useDpFeriasDocumentos`, `useDpOcorrencias`, `useDpTrocas`, `DpSolicitacoes`, `BulkReviewInline`, `BulkReviewDialog`) por essa rotina.
- `useStablePendencias` em `PendenciasCard.tsx` passa a aceitar remoções otimistas sem esperar `isFetching` terminar.
- Medição de `private.dp_refresh_document_pending(company_id)` via `EXPLAIN ANALYZE`/`timing` para decidir a etapa 5; se necessário, versão com escopo por unidade/competência.
- Testes: cobertura de baixa imediata em `PendenciasCard.test.tsx` e teste da rotina compartilhada.
