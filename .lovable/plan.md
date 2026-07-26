## Objetivo

Reorganizar cards de lista no mobile para eliminar texto encavalado — aplicando o mesmo padrão em todas as telas do 360°FOOD que sofrem do mesmo problema (linha única com muitos metadados + várias legendas de botões).

## Padrão a aplicar (mobile-first, desktop preservado)

Em cada card mobile (<`md`):

1. **Linha 1**: título truncado (`min-w-0 truncate`) + `Badge` de status compacto (label curto em pt-BR).
2. **Linha 2**: no máximo 1 metadado essencial (ex.: `tipo · N pág`, `vencimento`, `valor`). Datas completas, nomes de arquivo longos, contadores secundários e mensagens de erro saem daqui.
3. **Botões inline**: `size="icon"` (`h-8 w-8`) exibindo **apenas o ícone**, com `aria-label` e `title`. Ícones permanecem visíveis; texto vira `<span className="hidden md:inline">`. Adicionar botão **Detalhes** (`Info`) ícone-only.
4. **Card clicável → Sheet (bottom)** com:
   - Todas as informações completas (nome/arquivo completo, timestamps, contadores, erro).
   - **Mesmos botões da barra do card**, agora com ícone + legenda para clareza.
   - Confirmações (`AlertDialog`) e handlers idênticos aos existentes.
   - `e.stopPropagation()` nos triggers para não colidir com expand/collapse.
5. **Desktop (`md:`)**: layout atual intocado (label curto do badge continua sendo aplicado para consistência visual).

Utilitários compartilhados sugeridos (novos, `src/components/ui/`):

- `MobileActionButton` — wrapper de `Button` que renderiza ícone-only no mobile e ícone+label no desktop.
- `MobileDetailsSheet` — Sheet bottom padrão com header (título + badge), grid de metadados e footer de ações.
- `statusLabel(status)` — mapa curto pt-BR (`partially_imported → "Parcial"`, `processing → "Processando"`, `imported → "Importado"`, `pending → "Pendente"`, `approved → "Aprovado"`, `rejected → "Rejeitado"`, `failed → "Falhou"`, etc.).

## Telas afetadas

Aplicar o padrão nas listas de cards com o mesmo sintoma:

1. **`src/components/dp/documentos/BulkImportPanel.tsx`** — Lotes recentes (caso do print).
2. **`src/pages/dp/DpSolicitacoes.tsx`** — Solicitações do colaborador (Aprovar/Rejeitar + metadados longos).
3. **`src/pages/dp/DpAprovacoes.tsx`** — Aprovações do admin (mesmo perfil de card).
4. **`src/pages/dp/DpDocumentos.tsx`** — Lista de documentos (nome de arquivo + tipo + data + Revisar/Baixar/Excluir).
5. **`src/components/dp/documentos/BulkReviewInline.tsx`** — Itens do lote (páginas + colaborador + status + ações).

Escopo em cada arquivo: apenas o bloco de renderização de card/linha da lista principal. Nenhuma alteração em queries, mutations, RLS, tipos, filtros ou fluxos de negócio.

## Fora de escopo

- Formulários, dialogs de criação/edição, tabelas do desktop, calendários, dashboards.
- Qualquer mudança em backend, RPCs, RLS, Edge Functions ou schema.
- Refatorar telas que já usam esse padrão (ex.: `CalendarioMobileLista`).

## Verificação

Para cada tela afetada, abrir no preview mobile (407px) e conferir:
- Card em no máximo 2 linhas, sem quebra de texto entre botões.
- Botões inline só com ícone; badge com label curto em pt-BR.
- Tap no card abre o Sheet com todas as informações + mesmos botões funcionais (Revisar/Descartar/Aprovar/Rejeitar conforme a tela).
- No desktop (`md:`) o layout permanece idêntico ao atual.
