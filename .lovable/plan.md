# Melhorias — Histórico de Documentos + UX de Importação

## 1. Histórico do tipo (`DpDocumentosPorTipo.tsx`)

- **Remover coluna "Arquivo"** (`doc.file_name`) da tabela e do cabeçalho. Nome do arquivo original não agrega valor ao usuário final — o preview já mostra o documento.
- **Corrigir data/hora da aprovação**: hoje só mostra quando `revisado_em` existe. O trigger `dp-doc-bulk-approve` grava `aprovacao_status = 'aprovado'` mas não seta `revisado_em`. Ajustar a Edge Function para gravar `revisado_em = now()` e `revisado_por = uid` ao criar o documento aprovado via importação em massa. Para documentos legados sem `revisado_em`, cair para `created_at` como fallback exibindo "Importado em …".
- Renomear cabeçalho da coluna de "Revisado em" para **"Aprovado em"** (mais claro).

## 2. UX de importação em massa (`BulkImportPanel.tsx` + `BulkReviewInline.tsx`)

### 2.1 Durante o OCR (processamento)
Hoje o painel expandido tenta renderizar página a página conforme cada uma chega — dá a sensação de "só 1 página" quando ainda faltam 11. Alterar para:

- **Estado "Processando"**: enquanto `batch.status !== 'ready'`, ocultar o preview do PDF e mostrar um card centralizado com:
  - Ícone/animação sutil.
  - Texto: **"Processando páginas — X de Y"**.
  - **Barra de progresso** (`<Progress value={processed/total*100} />`) usando `processed_pages`/`total_pages` do batch.
  - Sub-texto: "Aguarde, todas as páginas serão exibidas juntas ao final."
- Só liberar o preview + navegação **quando `batch.status === 'ready'` E `rows.length === total_pages`**. Assim o usuário nunca vê "Página 1 de 2" e depois "Página 1 de 12".
- Manter o polling atual (já corrigido no turno anterior).

### 2.2 Durante o salvamento (aprovação)
Hoje ao clicar "Aprovar N documentos" o botão fica em `Loader2` sem indicar progresso. A Edge Function `dp-doc-bulk-approve` processa em loop os `item_ids`. Melhorar em duas camadas:

- **Frontend** (rápido, sem mudar backend):
  - Trocar o botão por um estado com overlay/modal bloqueante: **"Salvando documentos — aguarde"** com barra indeterminada + contador otimista ("Enviando N documentos para o servidor…").
  - Ao receber a resposta, mostrar toast detalhado (já existe) e um mini-resumo dentro do painel: "N aprovados, N duplicados, N com falha".
- **Backend com progresso real** (recomendado):
  - Alterar `dp-doc-bulk-approve` para, ao final de cada item processado, atualizar `dp_bulk_import_batches.processed_pages` (reaproveitar campo) ou um novo `approved_count`.
  - Frontend faz polling do batch a cada 800ms enquanto a mutation está pendente e alimenta a mesma `<Progress />`: **"Salvando X de Y documentos"**.
  - Vantagem: para lotes de 40+ páginas o usuário vê o avanço real, não trava sem feedback.

### 2.3 Ajustes visuais compartilhados
- Componente novo `BulkProgressBanner` (interno ao módulo) reutilizado nos dois momentos (OCR e aprovação), com props `phase: 'ocr' | 'saving'`, `current`, `total`.
- Cores/tokens do design system (`bg-primary/10`, `text-primary`), sem hardcode.

## 3. Fora de escopo
- Não mudar match de colaborador, detecção de competência nem RLS.
- Não mudar o layout do preview em si (já é o padrão Pakere).
- Não alterar `DpHistoricoCompleto.tsx` (a coluna "arquivo" ali já não é problema, é um resumo por documento).

## Detalhes técnicos

**Arquivos a editar:**
- `src/pages/dp/DpDocumentosPorTipo.tsx` — remover coluna arquivo, ajustar título/fallback da coluna de data.
- `src/components/dp/documentos/BulkReviewInline.tsx` — gate de preview até batch ready, banner de progresso OCR, banner de progresso de salvamento com polling.
- `src/components/dp/documentos/BulkReviewDialog.tsx` — mesmos ajustes (modal fullscreen).
- `src/components/dp/documentos/BulkImportPanel.tsx` — passar `batch` para o Inline via prop (evita segunda query).
- `supabase/functions/dp-doc-bulk-approve/index.ts` — gravar `revisado_em`/`revisado_por` nos docs aprovados; atualizar `approved_count` (nova coluna) a cada iteração.
- Migração: `ALTER TABLE dp_bulk_import_batches ADD COLUMN approved_count int NOT NULL DEFAULT 0;` (sem novas policies — herda as existentes).

**Como validar:**
1. Importar PDF de 12 páginas: painel mostra "Processando 3 de 12" com barra, sem preview parcial.
2. Ao chegar em 12/12, preview aparece já paginado corretamente.
3. Clicar "Aprovar 10 documentos": barra "Salvando 4 de 10 documentos" avança até 10/10.
4. Ir em Contracheques: coluna "Arquivo" sumiu; coluna "Aprovado em" mostra data + hora do momento da aprovação.
