# Importar documentos: envio no topo, rolagem automática e recomeço limpo

Três ajustes na tela de importação de documentos do Pessoas 360°. Nada de regra, banco ou motor de leitura muda — só a ordem e o comportamento da tela.

## 1. O envio do PDF vem primeiro

Hoje a tela mostra o quadro de pendências/consistência antes do quadro de envio, então em celular o botão "Processar PDF" fica muito abaixo.

- O quadro de envio do PDF passa a ser o primeiro conteúdo da tela, logo abaixo do título.
- O quadro de pendências (documentos faltando, férias a vencer etc.) vai para baixo do envio e, no celular, começa recolhido, mostrando só o resumo com a quantidade; um toque abre a lista.
- No computador o quadro de pendências continua aberto como hoje.

## 2. Ao tocar em "Processar PDF" a tela desce sozinha

- Assim que o envio começa, a tela rola suavemente até o lote recém-criado, que já abre expandido mostrando "Processando" e o andamento das páginas.
- O aviso de "PDF enviado — processando" continua aparecendo.
- Se o usuário rolar por conta própria durante o envio, a rolagem automática não insiste.

## 3. Depois de aprovar, a tela volta ao estado inicial

- Quando a aprovação termina e não sobra nenhuma página pendente no lote, o lote se fecha automaticamente e passa a aparecer só como "Importado" na lista.
- O formulário de envio é limpo: arquivo removido, natureza e mês/ano voltam ao padrão, pronto para o próximo PDF.
- A tela rola de volta até o quadro de envio, para o usuário ver que pode importar outro documento.
- Quando a natureza e o mês vieram de uma pendência (link "Resolver"), esses valores são mantidos, já que a pessoa costuma importar o mesmo tipo de novo.

## Detalhes técnicos

- `src/pages/dp/DpDocumentosImportar.tsx`: inverte a ordem de `BulkImportPanel` e `DocConsistenciaPanel`.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: conteúdo em `Collapsible`, aberto por padrão só a partir de `md` (via `useIsMobile`), cabeçalho com contagem.
- `src/components/dp/documentos/BulkImportPanel.tsx`:
  - `uploadCardRef` e `lotesRef`; após `upload.mutate` bem-sucedido, `scrollIntoView({ behavior: "smooth", block: "start" })` no lote novo (fallback no card de lotes).
  - novo callback `onLoteConcluido(batchId)` passado a `BulkReviewInline`: fecha o lote em `expanded`, reseta `file`, `tipo` e `referencia` para os valores iniciais (`tipoFixed ?? tipoInicial ?? AUTO_TIPO`) e rola até `uploadCardRef`.
- `src/components/dp/documentos/BulkReviewInline.tsx`: prop opcional `onConcluido`, disparada ao fim de `runApprove` quando nenhum item continua em `pending` com colaborador vinculado.
- Testes: caso puro para a regra "lote concluído" (sem pendentes restantes) em `src/lib/dp/__tests__`; typecheck e suíte DP; conferência visual em 360 px e 1280 px.

## Rollback

Reverter os quatro arquivos; nenhuma migração ou dado envolvido.
