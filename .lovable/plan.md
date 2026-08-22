# Documentos do Pessoas 360°: duas telas apenas

## Objetivo

Reduzir a área de Documentos de 8 itens de menu para **2 telas**:

1. **Importar Documentos** (`/dp/documentos`) — uma única tela onde o gestor solta qualquer PDF de DP (contracheque, contracheque de 13º, contracheque de férias, folha de ponto, adiantamento, outros). O sistema reconhece a natureza do documento, a competência e o colaborador, e distribui para o acesso de cada pessoa.
2. **Histórico de Documentos** (`/dp/documentos/historico`) — consulta única de tudo que já foi importado, com filtros e ações (baixar, ver, corrigir competência/natureza/colaborador, aprovar, excluir).

## Situação atual (verificada)

- Existem hoje: hub de Documentos, Contracheques, Arquivos de Ponto, Adiantamentos, Atestados, Registros Disciplinares, ACT/CCT, Histórico Completo e "Todos os Documentos".
- A importação em lote (`BulkImportPanel` + função `dp-doc-bulk-ingest`) já faz OCR/IA, extrai CPF/nome/competência e casa com o colaborador — mas a **natureza é fixa por lote** (o usuário escolhe antes de subir).
- O enum de tipos de documento tem `contracheque`, `ponto`, `adiantamento`, `ferias`, `atestado`, `disciplinar`, `sindicato`, `outros` etc. Não há tipo específico para contracheque de 13º nem para contracheque de férias.

## O que muda

### 1. Tela única de importação

- Nova página `DpDocumentosImportar` em `/dp/documentos`, com o painel de importação em modo **natureza automática** (sem tipo fixo).
- O usuário pode subir um lote misto. Para cada documento reconhecido, a tela mostra: colaborador, natureza detectada, competência, confiança e o status (pronto / revisar / duplicado / sem colaborador).
- Toda linha é editável antes de confirmar: natureza, competência e colaborador (inclui o fluxo já existente de vincular colaborador novo/faltante).
- Se a IA não determinar a natureza, o item entra como "A definir" e exige escolha manual — nunca é importado com natureza errada.
- Opcional por lote: "forçar natureza para todos", para quem já sabe que o arquivo é homogêneo.

### 2. Detecção de natureza por documento

- A função `dp-doc-bulk-ingest` passa a pedir também a natureza na extração (`NATUREZA: <chave>`), combinada com heurística por texto/nome do arquivo (ex.: "13º/décimo terceiro" → 13º; "férias" → contracheque de férias; "espelho/folha de ponto" → ponto; "adiantamento/vale" → adiantamento; "recibo de pagamento/holerite" → contracheque).
- A natureza passa a ser gravada **por item** (`dp_bulk_import_items.tipo_detectado`), com o tipo do lote virando apenas o padrão/fallback (`misto` permitido).
- A checagem de duplicidade (colaborador + tipo + competência) usa a natureza do item.

### 3. Novos tipos de documento

Adicionar ao enum: `contracheque_13` e `contracheque_ferias`. Rótulos e cores correspondentes no histórico, no portal do colaborador e nos filtros.

### 4. Histórico consolidado

- `/dp/documentos/historico` continua sendo a tela de consulta, com os novos tipos nos filtros e ações de correção inline (natureza, competência, colaborador) — hoje a correção existe apenas nas telas por tipo, que serão removidas.

### 5. Navegação e rotas

- Grupo "Documentos" da sidebar/menu Mais passa a ter: **Importar Documentos** e **Histórico de Documentos**.
- Atestados e Registros Disciplinares saem do grupo Documentos e continuam nos seus lugares próprios (Atestados junto de Folgas/Férias, Disciplinar nos cadastros), pois têm fluxo de aprovação próprio e não são importação de arquivo. Continuam aparecendo no Histórico.
- A tela ACT/CCT é renomeada para **Negociações Sindicais** e passa a viver no grupo **Cadastro** (nova rota `/dp/cadastros/negociacoes-sindicais`, com `/dp/documentos/act-cct` redirecionando para ela). Título, breadcrumb e rótulo do menu atualizados; rótulo no Histórico e no portal passa a "Negociações Sindicais".
- Rotas antigas (`/dp/documentos/contracheque`, `/ponto`, `/adiantamento`, `/todos`, hub) passam a redirecionar para as duas novas telas, preservando links salvos.
- Portal do colaborador segue igual (`/dp/meu/documentos`), apenas ganhando os rótulos dos novos tipos.

## Detalhes técnicos

- Migração: `ALTER TYPE dp_documento_tipo ADD VALUE 'contracheque_13'`, `'contracheque_ferias'`; coluna `tipo_detectado` em `dp_bulk_import_items` e liberação do valor `misto` no tipo do lote (grants/policies existentes seguem válidos).
- Edge function `dp-doc-bulk-ingest`: prompt atualizado para retornar `COMPETENCIA` + `NATUREZA`; heurística de fallback em TS; gravação de `tipo_detectado` por item; duplicidade por item.
- `dp-doc-bulk-approve`: usa `tipo_detectado ?? batch.tipo` ao criar o registro em `dp_documentos`.
- `BulkImportPanel` / `BulkReviewInline`: coluna de natureza editável por item, filtro "a definir" e ação em lote "aplicar natureza".
- Remoção: `DpDocumentosPorTipo.tsx`, `DpDocumentosHub.tsx`, `DpDocumentos.tsx` (substituídos pelas duas telas) e ajuste de `src/config/dpNavigation.tsx` e do teste de paridade de navegação.
- Mobile: as duas telas usam os componentes padrão do módulo (`DpPage`, `DpFilters`, `DpTabsBar`).

## Fora do escopo

Nenhuma geração de folha ou de ponto — segue apenas importação, conforme já definido no projeto.
