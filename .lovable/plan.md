## Diagnóstico

O projeto tem duas rotas distintas e o usuário caiu na errada:

- `/dp/documentos/contracheque` (e `ponto`, `adiantamento`) → `DpDocumentosPorTipo.tsx`: upload **individual** de 1 PDF já vinculado a 1 colaborador. Não divide páginas, não faz OCR, não gera fila de aprovação. Foi o que aconteceu ("importou o arquivo inteiro").
- `/dp/documentos/importar` → `DpDocImportBulk.tsx`: upload de 1 PDF com N contracheques, divide páginas via `pdf-lib`, roda OCR via `dp-doc-bulk-ingest` (Gemini/Lovable AI), casa por CPF/nome, gera lote pendente e exibe UI de aprovação.

O bulk existe e funciona, mas está escondido em uma rota separada, sem link a partir das páginas por tipo — por isso o admin não encontra e não vê a etapa de aprovação.

## O que fazer

### 1. Integrar bulk direto nas páginas por tipo
Em `src/pages/dp/DpDocumentosPorTipo.tsx`, ao lado do upload individual, adicionar seção **"Importar em massa (PDF com várias páginas)"** que reaproveita a mesma mutação/UI do `DpDocImportBulk`. O `tipo` é fixado pelo contexto da página (contracheque/ponto/adiantamento), a **Referência** vem do `mesRef`/`anoRef` que já existem na página, e o campo Tipo do bulk fica oculto.

Fluxo visível na mesma tela:
1. Card "Novo lote" (dropzone + drag-and-drop + botão Processar).
2. Card "Lotes pendentes de aprovação" listando apenas os lotes deste `tipo` + `company_id` com `status in ('processing','ready')`, expandindo direto para a lista de páginas com CPF detectado, colaborador sugerido, botão "Ver página" e ações Aprovar/Rejeitar (mesma lógica que já está no `DpDocImportBulk`).

### 2. Extrair componente reutilizável
Mover a UI de lote/itens/aprovar/rejeitar de `DpDocImportBulk.tsx` para `src/components/dp/documentos/BulkImportPanel.tsx` com props `{ tipo, referencia, hideTipoSelect?, hideReferenciaInput? }`. `DpDocImportBulk` e as três páginas por tipo passam a consumir esse componente. Zero mudança de schema.

### 3. Melhorias de robustez no fluxo atual
- **Drag-and-drop** no input de PDF (aceita apenas `application/pdf`, valida `size ≤ 20MB`).
- **Progresso visível durante OCR**: `DpDocImportBulk` hoje só mostra spinner até a Edge Function responder (pode levar 30-60s para 60 páginas). Fazer polling do batch por `id` a cada 3s enquanto `status='processing'` e exibir contador `processed_pages / total_pages` (a Edge Function já atualiza `total_pages` antes do loop — adicionar `processed_pages` incremental na tabela `dp_bulk_import_batches` via `update` dentro do loop de `dp-doc-bulk-ingest`).
- **Timeout / erro claro**: se o invoke falhar, marcar o batch como `failed` com `error_message` e mostrar detalhes ao clicar no lote (hoje o toast some).
- **Pré-extração local de mês/ano** com `pdfjs-dist` na primeira página do PDF (regex tipo "MARÇO/2026", "COMPETÊNCIA 03/2026") para pré-preencher a Referência antes do upload — reduz custo de OCR quando o usuário esquece de preencher a data.
- **Validação de duplicidade** ao aprovar: `dp-doc-bulk-approve` deve rejeitar se já existe `dp_documentos` para o mesmo `(colaborador_id, tipo, mes, ano)` — retornar `{ok:false, reason:"duplicate"}` para o item, mostrado no toast final.
- **Contador de "pendentes de aprovação"** no card da página de tipo: query em `dp_bulk_import_items` filtrando `status='pending' AND matched_colaborador_id IS NOT NULL` do tipo/empresa atual.

### 4. Descoberta / navegação
- Manter `/dp/documentos/importar` como página geral (multi-tipo), mas adicionar botão "Importar em massa" no header de cada `DpDocumentosPorTipo` que rola para a seção bulk (âncora `#bulk`).
- No `DpDocumentosHub`, adicionar badge amarelo "⚠ N vínculos pendentes" nos cards de tipo quando houver itens `pending` no bulk (usar a mesma query do item 3, agregada por tipo).

## O que **não** vai ser feito (evitar retrabalho)

- Não copiar os arquivos do Pakere (`DocumentImportForm.tsx`, `pdf-utils.ts`, `admin-api.ts`, `import-documentos/index.ts`). Eles usam schema incompatível (`documentos`, `profiles.possui_folha_ponto`, `auth-context`) e a Edge Function anexada só ecoa o arquivo — não persiste nada. Manter nossa `dp-doc-bulk-ingest` com OCR AI.
- Não trocar `pdfjs-dist` (já usado em `nubankPdf.ts`) — reaproveitar a configuração de worker que já funciona.

## Detalhes técnicos

**Arquivos criados**
- `src/components/dp/documentos/BulkImportPanel.tsx` (~250 linhas, extraído de `DpDocImportBulk.tsx`)
- `src/lib/dp/pdfPreextract.ts` — regex de mês/ano na página 1

**Arquivos alterados**
- `src/pages/dp/DpDocImportBulk.tsx` — passa a usar `BulkImportPanel`
- `src/pages/dp/DpDocumentosPorTipo.tsx` — adiciona `<BulkImportPanel tipo={tipo} referencia={...} hideTipoSelect />`
- `src/pages/dp/DpDocumentosHub.tsx` — inclui contagem de `dp_bulk_import_items` pendentes por tipo
- `supabase/functions/dp-doc-bulk-ingest/index.ts` — atualiza `processed_pages` incremental
- `supabase/functions/dp-doc-bulk-approve/index.ts` — checagem de duplicidade `(colaborador,tipo,mes,ano)`

**Migração SQL**
```sql
ALTER TABLE public.dp_bulk_import_batches
  ADD COLUMN IF NOT EXISTS processed_pages int NOT NULL DEFAULT 0;
```

## Como validar

1. `/dp/documentos/contracheque` → seção "Importar em massa" visível, com dropzone.
2. Upload de PDF com 3 páginas de contracheques distintos → status vai `processing → ready`, contador `1/3, 2/3, 3/3`.
3. Lista mostra 3 itens com CPF detectado e colaborador sugerido; botão "Aprovar 3 vinculado(s)" cria 3 registros em `dp_documentos` com `mes/ano` da referência.
4. Reenviar o mesmo PDF → aprovação marca duplicados como `failed` com motivo visível.
5. Badge amarelo aparece no card do Hub enquanto houver itens `pending`.
