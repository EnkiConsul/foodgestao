# DP-G10 — Folha de Pagamento + Importação em massa + Aprovações & Notificações + Histórico

Auditoria em **modo leitura**. Nenhuma alteração aplicada.

## Escopo

Telas admin restantes do módulo DP não cobertas em G06–G09:

| Rota | Arquivo | Função |
|---|---|---|
| `/dp/folha` | `src/pages/dp/DpFolhaHub.tsx` | Hub de períodos (adiantamento/mensal/quinzenal/13º) |
| `/dp/folha/periodos/:id` | `src/pages/dp/DpFolhaPeriodo.tsx` | Lançamentos de um período, gerar + enviar p/ Financeiro |
| `/dp/folha/aprovacoes` | `src/pages/dp/DpFolhaAprovacoes.tsx` | Aprovação em lote pelo Financeiro |
| `/dp/docs/import` | `src/pages/dp/DpDocImportBulk.tsx` | Ingestão OCR de PDFs multi-página |
| `/dp/aprovacoes` | `src/pages/dp/DpAprovacoes.tsx` | Central de notificações administrativas |
| `/dp/documentos/historico` | `src/pages/dp/DpHistoricoCompleto.tsx` | Histórico unificado de documentos |
| `/dp` (home admin) | `src/pages/dp/DpHome.tsx` | Painel de KPIs + atalhos |

Tabelas envolvidas: `dp_folha_periodos`, `dp_folha_lancamentos`, `dp_bulk_import_batches`, `dp_bulk_import_items`, `dp_notificacoes`, `dp_documentos`. Edge functions: `dp-doc-bulk-ingest`, `dp-doc-bulk-approve`. Bucket: `dp-bulk-import`, `dp-documentos`.

## Divergências (23 itens em 5 grupos)

### Grupo 1 — Bugs de runtime e integridade de dados (🔴 alta)

| ID | Arquivo | Divergência |
|---|---|---|
| DIV-G10-01 | `DpFolhaHub.tsx:136` | Ação "Aprovações" usa `window.location.assign` — perde estado do React Router e faz reload da SPA. Deve usar `useNavigate()`. |
| DIV-G10-02 | `DpFolhaHub.tsx:44` | `insert` de período **não** valida duplicidade (`company_id`+`competencia`+`tipo`). Erro de UNIQUE aparece como texto cru; falta pré-check + tratamento. |
| DIV-G10-03 | `DpFolhaPeriodo.tsx:67-76` | `updateValor` altera `valor_bruto` **e** `valor_liquido` com o mesmo número. Ignora descontos/proventos e não recalcula. Deve editar apenas `valor_liquido` (ou abrir modal de composição). Também falta `onError` toast. |
| DIV-G10-04 | `DpFolhaPeriodo.tsx:78-98` | "Enviar p/ Financeiro" faz 2 updates sequenciais sem transação — se o 2º falhar, lançamentos ficam `aprovado_dp` com período `aberto`. Mover para RPC `dp_folha_enviar_financeiro(_periodo_id)`. |
| DIV-G10-05 | `DpFolhaPeriodo.tsx:119` | Botão desabilita só quando `status !== "aberto"` — não bloqueia quando `lancsQ.data.length === 0`. Envia período vazio. |
| DIV-G10-06 | `DpFolhaAprovacoes.tsx:54-64` | `aprovar` faz update em massa sem gerar `transactions`. Toast diz "Despesas geradas no financeiro" mas nenhum código chama edge/rpc para criar despesa em `transactions`. Ou o trigger existe e falta documentar, ou a promessa é falsa. Necessário auditar `dp_folha_lancamentos` triggers. |
| DIV-G10-07 | `DpFolhaAprovacoes.tsx:73-85` | `rejeitar` sem `AlertDialog` — clique único cancela lançamentos irreversivelmente. |
| DIV-G10-08 | `DpDocImportBulk.tsx:162-165` | `window.open(signedUrl)` bloqueia pop-up no iOS/Safari. Trocar por `<a>` programático como já feito em DpDocumentos (G09). |
| DIV-G10-09 | `DpDocImportBulk.tsx:132-142` | `reject` sem confirmação. Bulk import de 60 páginas → cliques acidentais custam OCR refeito. |
| DIV-G10-10 | `DpDocImportBulk.tsx:52-66` | Query `items` roda `.in("batch_id", ids)` com todos os expandidos — se o usuário expandir 20 lotes, puxa milhares de itens. Deve ser 1 query por batch com `enabled` condicional ou refetch on-demand. |

### Grupo 2 — UX / componentes shadcn (🟠 média)

| ID | Arquivo | Divergência |
|---|---|---|
| DIV-G10-11 | `DpFolhaHub.tsx:65` | `DialogContent` do "Novo período" sem `DialogDescription` (a11y warning do Radix). |
| DIV-G10-12 | `DpFolhaPeriodo.tsx:105-107` | Botão "Voltar" acima do `DpPageHeader` viola padrão fixado em G08 (breadcrumb interno ao header). Remover. |
| DIV-G10-13 | `DpFolhaPeriodo.tsx:113` | Status exibido em `p.status` cru (ex. `aprovado_dp`) em vez do label mapeado. |
| DIV-G10-14 | `DpFolhaAprovacoes.tsx:143` | Badge do status usa string crua (`{l.status}`) sem label amigável. |
| DIV-G10-15 | `DpAprovacoes.tsx:116` | `Badge className="bg-primary"` hardcoded — usa cor mas ignora `text-primary-foreground`, quebra contraste no dark. Usar `variant="default"`. |
| DIV-G10-16 | `DpHistoricoCompleto.tsx:74` | `window.open(signedUrl)` — mesmo problema iOS de DIV-G10-08. |

### Grupo 3 — Filtros / busca / colunas ausentes (🟠 média)

| ID | Arquivo | Divergência |
|---|---|---|
| DIV-G10-17 | `DpFolhaHub.tsx` | Sem filtro de status (Aberto/Fechado/Aprovado/Pago) nem busca por competência. Lista completa sem paginação. |
| DIV-G10-18 | `DpFolhaPeriodo.tsx` | Sem busca por colaborador nem totalizadores por status (nº de rascunho vs aprovado). |
| DIV-G10-19 | `DpFolhaAprovacoes.tsx` | Sem filtro por tipo de folha nem por competência. Total selecionado (soma em R$) não é exibido no botão. |
| DIV-G10-20 | `DpDocImportBulk.tsx` | Sem filtro de status de lote (processing/imported/failed), sem indicador visual de páginas pendentes vs aprovadas na linha do batch. |

### Grupo 4 — Integrações e observabilidade (🟡 baixa)

| ID | Arquivo | Divergência |
|---|---|---|
| DIV-G10-21 | `DpFolhaAprovacoes.tsx:57` | `accountId` opcional — se aprovador esquecer de escolher, despesa é criada sem conta bancária de origem, quebrando conciliação. Deve ser **obrigatório** para aprovar. |
| DIV-G10-22 | `DpFolhaPeriodo.tsx` / `DpFolhaAprovacoes.tsx` | Não há botão para **reabrir** período (voltar de `aprovado_dp` → `aberto`) nem log/histórico do ciclo. |
| DIV-G10-23 | `DpDocImportBulk.tsx:208-214` | Card "Lotes recentes" limita a 20 sem paginação. Batches antigos ficam inacessíveis. |

### Grupo 5 — Home admin / atalhos (🟢 melhoria)

- `DpHome.tsx` não expõe atalho direto para `/dp/folha`, `/dp/folha/aprovacoes` nem `/dp/docs/import`. Aparecem só via sidebar. Adicionar cards ou atalhos favoritos.
- Sem KPI de folha (ex. "R$ X em aprovação financeira", "N lotes pendentes").

## Ordem sugerida de aplicação

1. **G1** (10 itens) — corrigir bugs críticos primeiro (navegação, transação, duplicidade, pop-up iOS, confirmações destrutivas).
2. **G2** (6 itens) — a11y de dialogs, labels de status, tokens semânticos.
3. **G3** (4 itens) — filtros e busca.
4. **G4** (3 itens) — obrigar conta bancária, permitir reabrir período, paginar batches.
5. **G5** — polir home admin.

Nenhuma migration prevista. **Possível migration opcional** se optarmos por criar a RPC `dp_folha_enviar_financeiro` (DIV-G10-04) e a RPC de reabertura (DIV-G10-22).

## Fora de escopo

- Regras fiscais/CLT do cálculo (INSS, IRRF, FGTS) — pertence a fase futura DP-G11 (motor de folha).
- Refatoração da edge `dp-doc-bulk-ingest` (fica para revisão dedicada de edge functions).
