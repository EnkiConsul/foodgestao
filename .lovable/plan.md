# Importação de documentos: anexo visível, duplicados ignorados e navegação embaixo

Três ajustes na tela de importação/revisão de documentos. Nenhuma regra de negócio, banco, permissão ou motor de leitura de PDF muda.

## 1. Deixar claro que o arquivo foi anexado

Hoje, ao escolher o PDF, só o nome aparece em texto pequeno dentro da moldura pontilhada.

- Ao anexar, a área de envio passa a ter fundo verde claro e borda verde, com um ícone de confirmação no lugar da nuvem de envio.
- O nome do arquivo ganha destaque e aparece a linha "Arquivo pronto para processar" com um botão pequeno para trocar/remover o arquivo.
- Enquanto se arrasta um arquivo por cima, o realce de arraste continua tendo prioridade.

## 2. Página duplicada ignorada deve sair da revisão

Ao aprovar um lote com duplicidade e escolher "Ignorar os duplicados", só as páginas novas são enviadas. As páginas duplicadas continuam marcadas como "aguardando decisão", então o lote não se fecha e a tela segue mostrando as duas páginas para aprovar de novo.

- Ao escolher ignorar os duplicados, essas páginas passam a ficar registradas como "Duplicada — ignorada", saindo da fila de aprovação.
- Com isso o lote se conclui: fecha automaticamente, aparece como importado na lista e o formulário de envio volta ao estado inicial.
- O aviso de resultado continua informando quantas foram importadas e quantas foram ignoradas por duplicidade.
- Nada é apagado: a página segue no lote com o motivo registrado, e a opção "Desfazer" continua disponível.

## 3. Setas de avançar/voltar também no rodapé da revisão

- A barra com Anterior / contagem de páginas / Próximo passa a existir também abaixo do documento, logo antes do botão de aprovar.
- Mesmo comportamento e mesmos limites da barra de cima; no celular fica compacta com alvos de toque confortáveis.

## Detalhes técnicos

- `src/components/dp/documentos/BulkImportPanel.tsx`: classes condicionais no `label` de upload quando `file` está definido (`border-green-500/60`, `bg-green-50 dark:bg-green-950/20`), ícone `CheckCircle2`, botão "Trocar arquivo" que limpa `file`.
- `src/components/dp/documentos/BulkReviewInline.tsx`:
  - em `ConfirmarSubstituicaoDialog.onSkip`, antes de `runApprove(nonDupIds, "skip")`, atualizar os itens duplicados em `dp_bulk_import_items` para `status = "rejected"`, `decided_at = now()` e o motivo de duplicidade, e passar esses ids como já decididos ao avaliar a conclusão do lote;
  - extrair a barra de navegação atual em um bloco reutilizável (componente interno `PageNav`) e renderizá-lo no topo e no rodapé, antes do bloco de aprovação.
- `src/lib/dp/bulk-import-conclusao.ts`: `loteConcluido` passa a receber também os ids decididos como ignorados, para que o lote seja considerado concluído quando só restarem duplicados descartados.
- Testes: novos casos em `src/lib/dp/__tests__` para "lote concluído com duplicados ignorados".
- Sem migrations, sem alteração de RLS, edge functions ou classificação de documentos.

## Verificação

- Typecheck e suíte de testes de DP/hooks.
- Playwright em 360 px e 1280 px: anexar um PDF (conferir realce verde) e conferir as duas barras de navegação na revisão.

## Rollback

- Reverter os quatro arquivos citados; nenhum dado envolvido.
