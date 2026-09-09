# Revisão de documentos no celular: tela encavalada e lista sem tipo/competência

Duas correções visuais na área de importação de documentos, sem mexer em regras, banco ou permissões.

## 1. Tela de revisão encavalada no celular

Hoje a janela "Revisar importação" é montada em duas colunas fixas lado a lado (visualização do PDF + painel de edição com largura fixa). No celular a coluna da direita fica cortada, o texto some na borda e o conteúdo escapa da tela.

O que muda:
- No celular a revisão passa a ser em uma coluna só, empilhada: primeiro a lista de páginas, depois a visualização da página, depois os campos de colaborador e competência.
- A janela ocupa a largura útil da tela, com rolagem apenas dentro do conteúdo; o cabeçalho (nome do arquivo e contagem) e o rodapé (Aprovar / Fechar) ficam fixos.
- Nomes longos de arquivo quebram em duas linhas em vez de empurrar o conteúdo.
- Os botões Anterior / Próxima / abrir em nova aba ficam em uma barra compacta com alvos de toque confortáveis.
- No computador o layout atual em duas colunas permanece igual.

## 2. Tipo e competência visíveis na lista de lotes

Hoje o cartão de cada importação mostra o nome do arquivo em destaque e uma linha comprida cortada com o tipo; a competência só aparece abrindo os detalhes.

O que muda:
- O título do cartão passa a ser o assunto do documento: tipo + competência (ex.: "Contracheque · 08/2026"). Para lotes mistos: "Lote misto · 08/2026".
- O nome do arquivo vira detalhe secundário, em texto menor abaixo do título.
- A competência vem da referência informada no envio ou, quando em branco, da competência predominante detectada nas páginas; quando não houver, mostra apenas o tipo.
- A linha de contagem (páginas, vinculadas, importadas) e o selo de status continuam como estão.
- A folha de detalhes no celular passa a exibir o tipo com o rótulo legível e a competência.

## Detalhes técnicos

- `src/components/dp/documentos/BulkReviewDialog.tsx`: substituir `w-[1400px]` / `grid-cols-[1fr_420px]` por layout responsivo (`grid-cols-1` no mobile, `lg:grid-cols-[1fr_420px]`), `max-w-[100vw]`/`h-[100dvh]` no mobile, título com `break-words`, painel de edição em bloco empilhado com `min-w-0` nos containers.
- `src/components/dp/documentos/BulkReviewInline.tsx`: mesma verificação de colunas fixas; ajustar se houver grid rígido.
- `src/components/dp/documentos/BulkImportPanel.tsx`: no cartão do lote, título = `docTipoLabel(b.tipo)` (ou "Lote misto") + competência formatada a partir de `b.referencia_data` ou da competência predominante de `bItems`; arquivo em linha secundária; `MobileDetailsSheet` usando `docTipoLabel` e competência.
- Reaproveitar o helper de competência predominante já existente em `src/lib/dp/...` usado pelo diálogo de revisão.
- Sem migrations, sem alteração de RLS, edge functions ou lógica de classificação de documentos.

## Verificação

- Typecheck e a suíte de testes de DP.
- Playwright em 360 px e 1366 px: abrir a lista de lotes e a revisão, confirmar ausência de rolagem horizontal e leitura do tipo/competência sem abrir detalhes.
