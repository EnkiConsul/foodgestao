# Correções Importação de Contracheque — Paridade Pakere

## Problemas relatados
1. **Erro:** `svc.rpc(...).catch is not a function` — quebra a Edge Function e trava o processamento.
2. **UX:** após o processamento, a prévia da página não aparece automaticamente — é preciso clicar em "Revisar" e depois em cada página.
3. **Performance:** OCR demorado.

## Diagnóstico

### 1. Erro `svc.rpc(...).catch`
Em `supabase/functions/dp-doc-bulk-ingest/index.ts:276`:

```ts
await svc.rpc("dp_bulk_increment_processed", { p_batch_id: batch_id }).catch(async () => { ... });
```

O builder do `supabase-js` é *thenable* mas **não expõe `.catch`**. Resultado: exceção em cada página processada → o `finally` explode e o contador `processed_pages` nunca é incrementado → o batch fica "processando" para sempre e as prévias nunca destravam.

### 2. Preview não aparece automaticamente
No `BulkImportPanel.tsx` o painel expandido mostra apenas a **tabela de páginas**. O preview grande só existe dentro do `BulkReviewDialog`, acessível via botão "Revisar". No modal, o preview mostra **uma página por vez** e exige `Anterior/Próximo` para navegar — o usuário quer o padrão Pakere: preview grande **inline**, aparecendo assim que a página é processada, com scroll contínuo entre páginas.

### 3. OCR lento
Hoje: janelas de 5 páginas em paralelo usando `google/gemini-2.5-flash` via AI Gateway com prompt completo por página. Sem pré-carregamento e sem cache do preview.

---

## Plano de correção

### A. Backend — Edge Function `dp-doc-bulk-ingest`
1. Substituir o padrão `.rpc(...).catch(...)` por `await` + checagem de `error`:
   ```ts
   const { error: incErr } = await svc.rpc("dp_bulk_increment_processed", { p_batch_id });
   if (incErr) { /* fallback select+update */ }
   ```
   Aplicar a mesma revisão em todo o arquivo (audit rápido por `.catch(`).
2. Garantir que o `finally` **nunca** lance — envolver o fallback em `try/catch` silencioso.
3. Aumentar paralelismo do OCR de 5 → 8 páginas e reduzir `max_tokens` do prompt para acelerar resposta (mantendo qualidade da extração de nome/CPF/competência).

### B. Frontend — Preview inline estilo Pakere
Reescrever a seção expandida do batch em `BulkImportPanel.tsx` para adotar o layout do print de referência:

```text
┌─────────────────────────────────────────────────────────┐
│ Importar Contracheques                                  │
│ Recibo de Pagamento 06.2026.pdf                         │
│ [====================]  9 vinculados · 0 ignorados · 3 pendentes │
├─────────────────────────────────────────────────────────┤
│ [< Anterior]   Página 1 de 12   [Próximo >]             │
│ ┌───────────────────────────────────────────────────┐   │
│ │ [✓] Vinculado automaticamente (nome exato)        │   │
│ │                                    [-] 100% [+]   │   │
│ │  ┌─────────────────────────────────────────────┐  │   │
│ │  │       PREVIEW GRANDE DA PÁGINA              │  │   │
│ │  │       (canvas pdfjs, scale 1.5)             │  │   │
│ │  └─────────────────────────────────────────────┘  │   │
│ │  Colaborador: [ALESSANDRA MOREIRA ▼]              │   │
│ │  Competência: [06/2026]  [Rejeitar] [Cadastrar +] │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

Passos:
1. Extrair o corpo do `BulkReviewDialog` para um componente reutilizável `BulkReviewInline` (mesma lógica de canvas/pdfjs, matches, ações).
2. No `BulkImportPanel`, quando o batch estiver expandido e tiver ≥ 1 página processada, **renderizar `BulkReviewInline` diretamente** (não mais só a tabela). Manter a tabela como aba secundária "Lista" para quem quiser visão tabular.
3. Autoexpandir o batch e posicionar em `currentIdx = 0` assim que `processed_pages` passar de 0 → 1 (via `useEffect` observando `batches.data`).
4. **Pré-carregar** a próxima e a anterior páginas do PDF (canvas em memória) para eliminar flicker ao clicar `Próximo`.
5. Manter atalhos `←`/`→` para navegar e `Enter` para aprovar a página atual.
6. Manter o botão "Revisar" (abre o `BulkReviewDialog` em tela cheia) para quem precisar de zoom máximo.

### C. Performance de preview
1. Cachear o `pdfjs Document` por `page_file_path` em `useRef<Map>` — evita rebaixar/reparsear a mesma PDF ao trocar de página.
2. Usar `createSignedUrls` em batch (todos os `page_file_path` do batch de uma vez) em vez de 1 chamada por página.
3. `scale` dinâmico baseado no `devicePixelRatio` para nitidez sem custo em telas 1x.

---

## Detalhes técnicos

**Arquivos alterados**
- `supabase/functions/dp-doc-bulk-ingest/index.ts` — remover `.catch` do rpc, aumentar paralelismo.
- `src/components/dp/documentos/BulkReviewDialog.tsx` — extrair lógica de preview para hook `usePagePreview` + componente `BulkReviewInline`.
- `src/components/dp/documentos/BulkReviewInline.tsx` (novo) — layout do print.
- `src/components/dp/documentos/BulkImportPanel.tsx` — trocar tabela por `BulkReviewInline` como visão primária, autoexpandir batch em progresso, pré-carregar páginas vizinhas.

**Não muda**
- Schema do banco, RLS, matching de colaborador, cadastro inline, aprovação em lote.

## Fora de escopo
- Redesenhar o `BulkReviewDialog` de tela cheia (mantém comportamento atual).
- Trocar o provedor de OCR.
