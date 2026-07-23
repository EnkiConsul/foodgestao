# Plano Final — Importação de Documentos DP (Paridade Pakere)

Consolidação de 23 itens: 3 extras críticos de UX/performance + 20 pontos de paridade com o projeto original.

## Objetivo

Unificar toda a importação de documentos DP (contracheque, ponto, adiantamento, atestado, disciplinar) em um único fluxo estilo Pakere: upload de PDF → processamento em background com preview em tempo real → revisão página-a-página com preview grande e ações inline → aprovação em lote com validação de duplicidade.

---

## Bloco A — Extras críticos (UX + performance)

### A1. Processamento em background (destravar UI)
- Refatorar `supabase/functions/dp-doc-bulk-ingest/index.ts`:
  - Validar payload, criar `dp_bulk_import_batches` + `dp_bulk_import_items` (status `pending`), e retornar `202 Accepted` com `batch_id` em <2s.
  - Envolver o loop de OCR/match em `EdgeRuntime.waitUntil(processBatchAsync(batchId))`.
  - Atualizar `processed_pages` via SQL: `set processed_pages = least(total_pages, greatest(processed_pages, coalesce(processed_pages,0)+1))`.
- Frontend (`BulkImportPanel.tsx`): após 202, abrir imediatamente o dialog de revisão em modo streaming, com `useQuery` + `refetchInterval: 1500` até `status = 'ready_for_review'`.

### A2. OCR paralelo (reduzir 96s → ~25s para 12 páginas)
- No worker background, processar páginas em janelas de 5 com `Promise.all`.
- Cada página conclui individualmente e é gravada no item correspondente — a revisão exibe as thumbs conforme chegam.
- Manter retry (1x) por página em caso de erro Gemini; marcar `status = 'ocr_failed'` após falha final para permitir reprocessamento manual.

### A3. Redesenho do painel de revisão (paridade visual Pakere)
- Novo `src/components/dp/documentos/BulkReviewDialog.tsx` com layout dois painéis:
  - **Esquerda (280px):** lista scrollável de páginas com thumb, nome detectado, badge de status (processando / pronto / vinculado / inativo / duplicado / ignorado).
  - **Direita (flex):** preview grande do PDF via `pdfjs-dist` com controles de zoom (+/-/fit), rotação e navegação prev/next.
  - **Rodapé fixo:** metadados editáveis (colaborador, competência mês/ano) + ações inline (Vincular / Desvincular / Ignorar / Cadastrar colaborador) + botão "Aprovar e Salvar Documentos" (habilitado apenas com todas as pendências resolvidas).

---

## Bloco B — 20 itens de paridade com Pakere original

### Detecção e matching
1. **Auto-competência:** worker executa `extractPeriodo(pageText)` com as regexes do Pakere (`/(?:comp\.?|competência|referência)\s*[:\-]?\s*(\d{2})\/(\d{4})/i`, fallback por nomes de mês). Campo de referência no upload vira opcional.
2. **Match por nome exato bounded:** regex `\b<nome normalizado>\b` no texto normalizado (sem acentos, uppercase) para evitar falso-positivo por substring.
3. **Filtro por unidade via CNPJ:** detectar CNPJ no cabeçalho da página; restringir candidatos aos colaboradores daquela unidade.
4. **Filtro `possui_folha_ponto`:** para tipo `ponto`, considerar apenas colaboradores com a flag ativa.
5. **Incluir inativos no match:** salvar `matched_colaborador_ativo: false` no item quando aplicável.
6. **Match multi-página:** páginas consecutivas do mesmo colaborador são agrupadas em um único documento final.

### UI de revisão
7. **Badge amarelo "Colaborador inativo":** exige ação explícita (`Manter vínculo` ou `Desvincular`) antes de aprovar.
8. **Badge vermelho "Duplicado":** quando já existe documento do mesmo colaborador/tipo/mês/ano, oferecer `Substituir` ou `Manter antigo`.
9. **Ação Ignorar página** com desfazer (mantém o item mas exclui da aprovação).
10. **Cadastro inline de colaborador** via Dialog com campos completos: nome, CPF, cargo, unidade, admissão, folga fixa, `possui_folha_ponto`. Após salvar, refaz match automaticamente na página atual.
11. **Contador no header:** "X de N páginas prontas para aprovação".
12. **Botão "Aprovar e Salvar Documentos"** com contagem, desabilitado se houver pendências não resolvidas.

### Backend/dados
13. **Verificação de duplicidade** no momento da aprovação (query em `dp_documentos` por colaborador+tipo+mês+ano).
14. **Aprovação em chunks de 3** para estabilidade (evita timeout em lotes grandes).
15. **Rollback de storage:** se o insert em `dp_documentos` falhar, remover o arquivo enviado ao bucket.
16. **Split físico do PDF por colaborador** no momento da aprovação (usar `pdf-lib` no Edge Function), gerando um arquivo por documento final.
17. **Nome de arquivo padronizado:** `<tipo>_<cpf>_<aaaamm>.pdf`.
18. **Log de auditoria** por documento aprovado (`audit_logs`, ação `dp_documento_import`).

### Portal do colaborador e sidebar
19. **Remover página `/dp/documentos/importacao-em-massa`** e redirecionar para `/dp/documentos` (hub). Retirar item da sidebar admin.
20. **Badge de pendências no hub** (`DpDocumentosHub.tsx`): mostra batches em `processing` ou `ready_for_review` por tipo.

---

## Detalhes técnicos

**Arquivos criados:**
- `src/components/dp/documentos/BulkReviewDialog.tsx` (novo painel dois-painéis)
- `src/components/dp/documentos/PdfPreviewPane.tsx` (viewer com zoom via pdfjs-dist)
- `src/components/dp/documentos/CadastroColaboradorInlineDialog.tsx`
- `src/lib/dp/extractPeriodo.ts` (regexes Pakere)
- `src/lib/dp/matchColaborador.ts` (nome bounded + CNPJ + flags)

**Arquivos modificados:**
- `supabase/functions/dp-doc-bulk-ingest/index.ts` (background + paralelo + auto-competência)
- `src/components/dp/documentos/BulkImportPanel.tsx` (202 + streaming + botão "Processar PDF")
- `src/pages/dp/DpDocumentosPorTipo.tsx` (usar novo dialog)
- `src/pages/dp/DpDocumentosHub.tsx` (badges de pendência)
- `src/App.tsx` (remover rota importação em massa)

**Migrations:**
- Adicionar colunas em `dp_bulk_import_items`: `matched_colaborador_ativo boolean`, `duplicate_of uuid`, `page_thumb_url text`, `detected_cnpj text`, `detected_competencia text`.
- Índice em `dp_documentos (colaborador_id, tipo, ano, mes)` para checagem rápida de duplicidade.

**Fora de escopo (registrado para depois):**
- Migração para extração 100% client-side via `pdfjs-dist` (texto vetorial, como Pakere original). Mantemos Gemini server-side por decisão do usuário.

---

## Ordem de execução
1. Migration (colunas + índice).
2. Edge Function refatorada (background + paralelo + auto-competência + split + rollback).
3. `BulkReviewDialog` + `PdfPreviewPane` + `CadastroColaboradorInlineDialog`.
4. `BulkImportPanel` streaming + botão "Processar PDF".
5. Integração nas páginas por tipo + badges no hub.
6. Remoção da rota antiga.
7. Teste manual com PDF de 12 páginas multi-colaborador (contracheque + ponto).
