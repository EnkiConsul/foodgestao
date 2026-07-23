## Problema

Em `/dp/documentos/contracheque` (e nos outros tipos) a aba **Importar** ainda mostra **dois blocos**:

1. Bloco antigo "Importar Contracheques" com **"Processar PDF"** (upload simples, cria 1 documento sem OCR nem vínculo).
2. Bloco novo `BulkImportPanel` "Importação em massa — Contracheques" com **"Processar em massa"**.

Além disso, a **sidebar admin** (`src/components/dp/DpSidebar.tsx`) e a lista de favoritos (`src/components/dp/favoritablePages.ts`) ainda expõem o item **"Importar em massa"** apontando para `/dp/documentos/importar` — a rota até foi redirecionada, mas o link continua visível no menu.

## Mudanças

### 1. `src/pages/dp/DpDocumentosPorTipo.tsx`
- Remover todo o bloco antigo de upload simples: state `dragOver`, `pendingFile`, `uploading`, refs, funções `pickFile`/`processarPdf`, o JSX do card "Importar {tipo}" com "Processar PDF" (linhas ~98-102, 180-228, 325-371) e o import não usado do ícone `Upload` direto do label.
- Manter apenas o `<BulkImportPanel tipoFixed={tipo} title={cfg.importTitle} />` na aba Importar, agora como fluxo único (paridade Pakere: OCR, matching por CPF/período, cadastro inline de colaborador e aprovação página-a-página).
- Ajustar título do painel para o `importTitle` do tipo ("Importar Contracheques", "Importar Folhas de Ponto", "Importar Adiantamentos") para não repetir "Importação em massa".

### 2. `src/components/dp/DpSidebar.tsx`
- Remover a linha `{ title: "Importar em massa", url: "/dp/documentos/importar", ... }` (linha 65) do grupo Documentos.

### 3. `src/components/dp/favoritablePages.ts`
- Remover o item `/dp/documentos/importar` (linha 54) e o comentário sobre ordenação especial dessa rota (linha ~85).

### 4. Verificação
Após as edições, buscar por `documentos/importar` e `DpDocImportBulk` para garantir que não restam referências no admin. A rota em `App.tsx` continua como `Navigate` para `/dp/documentos` para preservar bookmarks antigos.

## Resultado esperado

- `/dp/documentos/contracheque|ponto|adiantamento` → aba **Importar** exibe **um único** painel de importação, com revisão página-a-página estilo Pakere.
- Sidebar admin sem o item duplicado "Importar em massa".
- Nenhum link ativo para `/dp/documentos/importar` no app.
