# Correção — Revisão só mostra 2 de 12 páginas

## Diagnóstico confirmado

No banco (`dp_bulk_import_items`) o lote `Recibo de Pagamento 06.2026.pdf` tem **12 itens**, todos com `company_id` correto e 10 vinculados. A RLS permite acesso.

O problema está no cliente, em `src/components/dp/documentos/BulkReviewInline.tsx` (e igualmente em `BulkReviewDialog.tsx`):

```ts
refetchInterval: (q) => {
  const rows = q.state.data ?? [];
  const anyPending = !rows.length
    || rows.some(r => r.status === "pending"
        && !r.matched_colaborador_id && !r.error_message);
  return anyPending ? 2000 : false;
}
```

Quando o admin expande o lote enquanto o OCR ainda está em andamento, a primeira query traz só os itens já persistidos (ex: 2 páginas). Todas com `matched_colaborador_id` preenchido → `anyPending = false` → **polling para**. As páginas seguintes nunca aparecem, e o rodapé mostra "Página 1 de 2 / Aprovar 2 documentos".

## Correção

Fazer o polling depender do **progresso do lote**, não só do que já foi carregado.

### 1. `BulkReviewInline.tsx`
- Adicionar um `useQuery` leve para o batch (`dp_bulk_import_batches` por id) — traz `status`, `total_pages`, `processed_pages`.
- Novo critério de refetch (a cada 1.5s):
  - `batch.status !== "ready"` **ou**
  - `rows.length < (batch.total_pages ?? 0)` **ou**
  - existe alguma linha `pending` sem match e sem erro.
- Quando `batch.status === "ready"` e `rows.length === total_pages`, parar (`return false`).
- Ao detectar que `batch.status` mudou para `ready`, chamar `qc.invalidateQueries(["dp_bulk_items_review", batchId])` para garantir refresh imediato.

### 2. `BulkReviewDialog.tsx`
Aplicar a mesma lógica (mesmo bug, mesmo padrão).

### 3. `BulkImportPanel.tsx`
Quando um lote passa de `processing` → `ready`, invalidar `["dp_bulk_items_review", batch.id]` além do que já é invalidado, para forçar o inline a atualizar.

## Fora do escopo
- Não mudar UI/layout do review (visual atual segue padrão Pakere, confirmado no print).
- Não alterar Edge Functions (`dp-doc-bulk-ingest/approve/discard`).
- Não alterar RLS.

## Como validar
1. Fazer upload de PDF com 12+ páginas.
2. Expandir o lote **antes** do OCR terminar.
3. Contador deve subir gradualmente até "Página 1 de 12" e "10 vinculados" assim que o batch ficar `ready`, sem exigir reload.
