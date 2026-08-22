# Central Única de Documentos do Pessoas 360°

## Objetivo

Reduzir a área de Documentos a **2 telas**:

1. **Importar Documentos** (`/dp/documentos`) — o gestor solta qualquer PDF de DP em lote; o sistema reconhece a natureza do documento, a competência e o colaborador, e distribui para o acesso de cada pessoa.
2. **Histórico de Documentos** (`/dp/documentos/historico`) — consulta única de tudo, com filtros, correções, aceites e pendências.

## Situação atual (verificada)

- Hoje existem: hub de Documentos, Contracheques, Arquivos de Ponto, Adiantamentos, Atestados, Registros Disciplinares, ACT/CCT, Histórico Completo e "Todos os Documentos".
- A importação em lote (`BulkImportPanel` + função `dp-doc-bulk-ingest`) já faz OCR/IA, extrai CPF/nome/competência e casa com o colaborador — mas a **natureza é fixa por lote**.
- O enum `dp_documento_tipo` cobre `contracheque`, `ponto`, `adiantamento`, `ferias`, `atestado`, `disciplinar`, `sindicato`, `outros` etc. Falta 13º, contracheque de férias, aviso e recibo de férias e informe de rendimentos.
- A tabela `dp_documento_aceites` já existe e já aceita `documento_id` — hoje é usada só no checklist de admissão (`requisito_id`).
- `dp_colaboradores` já tem as flags `possui_folha_ponto` e `optante_adiantamento`.

## O que muda

### 1. Catálogo único de naturezas

A central passa a tratar, com o mesmo fluxo (importar → reconhecer → distribuir → aceitar):

| Natureza | Chave |
| --- | --- |
| Contracheque Mensal | `contracheque` |
| Folha de Ponto | `ponto` |
| Adiantamento Salarial | `adiantamento` |
| Contracheque 13º | `contracheque_13` |
| Contracheque Férias | `contracheque_ferias` |
| Aviso de Férias | `aviso_ferias` |
| Recibo de Férias | `recibo_ferias` |
| Informe de Rendimentos | `informe_rendimentos` |
| Atestados | `atestado` |
| Disciplinares | `disciplinar` |
| Outros | `outros` |

Um único módulo de rótulos/cores/ícones (`src/lib/dp/documentos-tipos.ts`) alimenta importação, histórico, portal e filtros.

### 2. Tela única de importação

- Nova página `DpDocumentosImportar` em `/dp/documentos`, com o painel de importação em modo **natureza automática** (sem tipo fixo) e possibilidade de lote misto.
- Cada documento reconhecido mostra: colaborador, natureza detectada, competência, confiança e status (pronto / revisar / duplicado / sem colaborador / natureza a definir).
- Toda linha é editável antes de confirmar: natureza, competência e colaborador (mantendo o fluxo atual de vincular colaborador faltante/novo).
- Sem natureza detectada, o item fica como "A definir" e exige escolha manual — nunca é importado com natureza errada.
- Opção "aplicar natureza a todos" para lotes homogêneos.
- Atestados e registros disciplinares também podem ser importados aqui (além dos fluxos próprios de aprovação, que continuam existindo).

### 3. Detecção de natureza por documento

- `dp-doc-bulk-ingest` passa a extrair `COMPETENCIA` **e** `NATUREZA`, complementado por heurística de texto/nome de arquivo (13º/décimo terceiro, férias vs. aviso vs. recibo, espelho/folha de ponto, adiantamento/vale, informe de rendimentos/IR, recibo de pagamento/holerite).
- A natureza é gravada **por item** (`dp_bulk_import_items.tipo_detectado`); o tipo do lote vira padrão/fallback e aceita `misto`.
- Duplicidade (colaborador + natureza + competência) passa a usar a natureza do item.

### 4. Aceitação digital para todo documento

- Todo documento importado ganha o ciclo de aceite: **aguardando aceite → aceito em (data/hora)**, com registro de quem aceitou, IP e user agent, reaproveitando `dp_documento_aceites` via `documento_id`.
- Portal do colaborador: ao abrir um documento pendente, botão "Confirmo o recebimento"; a lista destaca o que falta aceitar.
- Histórico do gestor: coluna de aceite, filtro "não aceitos", contagem por competência e ação de cobrança (notificação ao colaborador).
- Aceite é sempre do próprio colaborador (nunca do gestor) e é imutável depois de registrado.

### 5. Consistência de Folha de Ponto e Adiantamento

Novo painel **Pendências da Competência** dentro do Histórico (e alerta no topo da importação), comparando as flags do cadastro com o que foi importado por competência:

- Flag ativa (`possui_folha_ponto` / `optante_adiantamento`) **sem** documento na competência → alerta "Falta importar".
- Flag inativa **com** documento importado na competência → alerta "Inconsistência de cadastro" com atalho para abrir o cadastro do colaborador ou revisar o documento.
- O painel lista colaborador, unidade, natureza, competência e o tipo de divergência, com link direto para a ficha.
- Cálculo em memória a partir de `dp_colaboradores` + `dp_documentos` (sem nova tabela).

### 6. Visibilidade do colaborador

- No portal, o colaborador vê **somente** documentos cujo `colaborador_id` é o dele — garantido pelas policies de `dp_documentos` e mantido nas consultas do portal.
- Documentos importados sem colaborador vinculado ficam retidos na importação e nunca aparecem no portal.

### 7. Navegação e rotas

- Grupo "Documentos" passa a ter: **Importar Documentos** e **Histórico de Documentos**.
- A tela ACT/CCT é renomeada para **Negociações Sindicais** e vai para o grupo **Cadastro** (`/dp/cadastros/negociacoes-sindicais`, com redirect de `/dp/documentos/act-cct`).
- Atestados e Registros Disciplinares mantêm suas telas de aprovação nos lugares próprios (Folgas/Férias e Cadastro), e aparecem também no Histórico.
- Rotas antigas (`/dp/documentos/contracheque`, `/ponto`, `/adiantamento`, `/todos`, hub) redirecionam para as duas novas telas.

## Detalhes técnicos

- Migração: novos valores no enum `dp_documento_tipo` (`contracheque_13`, `contracheque_ferias`, `aviso_ferias`, `recibo_ferias`, `informe_rendimentos`); coluna `tipo_detectado` em `dp_bulk_import_items`; liberação de `misto` no tipo do lote; em `dp_documentos`, colunas `exige_aceite` (default true para as naturezas do catálogo) e `aceito_em`/`aceito_por` derivados de `dp_documento_aceites`; policy de INSERT em `dp_documento_aceites` permitindo o próprio colaborador registrar aceite do seu documento (grants revisados na mesma migração).
- Edge functions: `dp-doc-bulk-ingest` (prompt + heurística + `tipo_detectado`), `dp-doc-bulk-approve` (usa `tipo_detectado ?? batch.tipo` e marca `exige_aceite`).
- Front: novo `src/lib/dp/documentos-tipos.ts`; novas páginas `DpDocumentosImportar` e histórico ampliado; `BulkImportPanel`/`BulkReviewInline` com natureza por item; hook `useDpDocumentosPendencias` para o painel de consistência; portal (`useMeusDocumentos`) com aceite e novos rótulos.
- Remoção: `DpDocumentosPorTipo.tsx`, `DpDocumentosHub.tsx`, `DpDocumentos.tsx`; ajuste de `src/config/dpNavigation.tsx` e do teste de paridade de navegação.
- Mobile: as duas telas usam os componentes padrão do módulo (`DpPage`, `DpFilters`, `DpTabsBar`).

## Fora do escopo

Nenhuma geração de folha ou de ponto — segue apenas importação, conforme já definido no projeto.
