# Destaque visual ao anexar arquivo na importação de documentos

Ajuste simples no card de envio de PDF para dar feedback imediato ao usuário quando um arquivo for selecionado.

## O que muda

- Na área de arrastar/soltar e selecionar arquivo de `BulkImportPanel.tsx`, quando `file` estiver definido o fundo passa para uma cor verde clara (ex.: `bg-green-50` / `dark:bg-green-950/20`) e a borda para verde (`border-green-300`).
- O ícone e o texto já exibem o nome do arquivo; mantém-se esse comportamento, apenas reforçando visualmente que o anexo foi reconhecido.
- Estados de drag-over (`dragOver`) têm prioridade visual sobre o estado de arquivo selecionado.

## Arquivo alterado

- `src/components/dp/documentos/BulkImportPanel.tsx`: adicionar classes condicionais no `label` de upload com base em `file`.

## Verificação

- Typecheck.
- Playwright em 360 px e 1280 px: selecionar um arquivo na tela `/dp/documentos` e confirmar que o card de upload fica com fundo verde claro e borda verde.

## Rollback

- Reverter a alteração no `className` do `label` de upload.
