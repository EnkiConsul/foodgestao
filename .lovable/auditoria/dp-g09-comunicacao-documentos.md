# Auditoria DP-G09 — Comunicação + Documentos gerais

**Escopo:** `/dp/comunicacao`, `/dp/avisos`, `/dp/mensagens`, `/dp/modelos-mensagem`, `/dp/documentos` (hub + listagem por categoria).
**Referência:** `pakere1996/portalcolaborador` — módulos *Comunicação* e *Documentos*.
**Data:** 2026-07-16
**Modo:** somente leitura — nenhuma alteração aplicada.

Legenda: 🔴 crítica · 🟠 alta · 🟡 média · 🟢 baixa

---

## 1. Rotas auditadas

| Rota | Componente | Status |
|---|---|---|
| `/dp/comunicacao` | `DpComunicacaoHub` | Conforme |
| `/dp/avisos` | `DpAvisos` | Parcial |
| `/dp/mensagens` | `DpMensagens` | Parcial |
| `/dp/modelos-mensagem` | `DpModelosMensagem` | Parcial |
| `/dp/documentos` | `DpDocumentosHub` | Parcial |
| `/dp/documentos/:categoria` | `DpDocumentos` | Parcial |

---

## 2. Divergências mapeadas

### Grupo 1 — Bugs / cores hardcoded (🔴/🟠)

- **DIV-G09-01 · 🟠** — `DpAvisos.prioridadeColor` usa `bg-blue-500/10`, `bg-orange-500/10`, `bg-red-500/10` (paleta fixa, quebra tema). Trocar por tokens semânticos (`bg-primary/10`, `bg-warning/10`, `bg-destructive/10`).
- **DIV-G09-02 · 🟠** — `DpDocumentos`: botões Aprovar/Recusar usam `border-green-300 text-green-700 hover:bg-green-50` / `border-red-300 …`. Substituir por variantes/tokens semânticos.
- **DIV-G09-03 · 🟡** — `DpDocumentos`: `TabsList` sem contêiner de card e sem espaçamento; visualmente cola no `DpContentCard`.
- **DIV-G09-04 · 🟠** — `DpAvisos.remove` sem `AlertDialog` de confirmação — clique único em ícone lixeira apaga o aviso.
- **DIV-G09-05 · 🟠** — `DpMensagens.remove` sem confirmação (idem).
- **DIV-G09-06 · 🟠** — `DpModelosMensagem.del` sem confirmação.
- **DIV-G09-07 · 🟡** — `DpDocumentos.del` sem `AlertDialog` (remove arquivo do storage + linha do banco em clique único).
- **DIV-G09-08 · 🟡** — `DpAvisos` não valida upload (sem limite de tamanho / mimes permitidos); nome do arquivo original é perdido.

### Grupo 2 — UX / filtros / busca (🟠/🟡)

- **DIV-G09-09 · 🟠** — `DpAvisos` sem filtros (prioridade, ativos vs expirados, fixados). Doc pede tabs "Ativos / Expirados / Todos".
- **DIV-G09-10 · 🟠** — `DpAvisos` não expõe `escopo`/`unidade_id`/`cargo_id` no formulário — sempre grava com defaults do banco. Doc pede seleção "Todos | Unidade | Cargo".
- **DIV-G09-11 · 🟠** — `DpMensagens` mostra só mensagens enviadas; falta caixa **Recebidas / Não lidas** (usa `lida_em`) e busca por destinatário/assunto.
- **DIV-G09-12 · 🟡** — `DpMensagens` sem indicador de lida/não-lida; sem contador no hub.
- **DIV-G09-13 · 🟡** — `DpMensagens` não permite broadcast (edge `dp-send-broadcast` já existe). Doc prevê botão "Enviar para grupo" (todos / unidade / cargo).
- **DIV-G09-14 · 🟡** — `DpModelosMensagem` sem busca por título/canal, sem filtro "Ativo/Inativo" (coluna `ativo` existe).
- **DIV-G09-15 · 🟡** — `DpModelosMensagem` sem preview do template com variáveis substituídas.
- **DIV-G09-16 · 🟡** — `DpDocumentos` sem busca por título/colaborador nem filtro por período (`referencia_data`).
- **DIV-G09-17 · 🟡** — `DpDocumentosHub` mostra contadores totais mas não destaca "pendentes de aprovação" por categoria — sinal importante para admin.
- **DIV-G09-18 · 🟢** — `DpDocumentos` cabeçalho "Categorias" (link voltar) fica acima do `DpPageHeader`, contrariando padrão (rem. em G08).

### Grupo 3 — Dados / integrações (🟠)

- **DIV-G09-19 · 🟠** — `useDpAvisos.upsert` faz `insert(payload)` sem `.select().single()` — sem id de retorno para telemetria/cache otimista.
- **DIV-G09-20 · 🟠** — `DpAvisos` não registra leitura em `dp_avisos_leituras` (tabela existe). Portal do colaborador (G03) espera indicador lido/não-lido.
- **DIV-G09-21 · 🟡** — `DpMensagens.send` insere direto; para grupos usar edge `dp-send-broadcast` (já implementada) — não é chamada por nenhuma tela hoje.
- **DIV-G09-22 · 🟡** — `DpDocumentos.download` abre `window.open` — em iOS Safari bloqueia pop-ups. Usar `<a href>` clicado programaticamente ou `target=_self` para download direto.

### Grupo 4 — Notificações (🟡)

- **DIV-G09-23 · 🟡** — Hub de Comunicação não expõe atalho para **Notificações** (`useDpNotificacoes` existe). Doc pede card "Central de notificações".
- **DIV-G09-24 · 🟡** — Não há tela `/dp/notificacoes` para admin gerenciar disparos e ver histórico do sino.

### Grupo 5 — Melhorias novas telas (🟢)

- **DIV-G09-25 · 🟢** — Criar página `/dp/notificacoes` (histórico + reenvio) para consumir `dp_notificacoes`.
- **DIV-G09-26 · 🟢** — Preview de template em `DpModelosMensagem` com input de exemplo de variáveis.
- **DIV-G09-27 · 🟢** — Badge "Aguardando aprovação" no card de cada categoria em `DpDocumentosHub`.

---

## 3. Mapa consolidado

| ID | Tela | Div. | Grav. | Grupo |
|---|---|---|---|---|
| 01 | Avisos | cores fixas | 🟠 | 1 |
| 02 | Documentos | cores aprov./recusar | 🟠 | 1 |
| 03 | Documentos | tabs sem espaçamento | 🟡 | 1 |
| 04 | Avisos | delete sem confirm. | 🟠 | 1 |
| 05 | Mensagens | delete sem confirm. | 🟠 | 1 |
| 06 | Modelos | delete sem confirm. | 🟠 | 1 |
| 07 | Documentos | delete sem confirm. | 🟡 | 1 |
| 08 | Avisos | upload sem validação | 🟡 | 1 |
| 09 | Avisos | filtros ausentes | 🟠 | 2 |
| 10 | Avisos | escopo/unid./cargo | 🟠 | 2 |
| 11 | Mensagens | caixa recebidas | 🟠 | 2 |
| 12 | Mensagens | indicador lida | 🟡 | 2 |
| 13 | Mensagens | broadcast | 🟡 | 2 |
| 14 | Modelos | busca/ativo | 🟡 | 2 |
| 15 | Modelos | preview | 🟡 | 2 |
| 16 | Documentos | busca/período | 🟡 | 2 |
| 17 | Doc Hub | pendentes por cat. | 🟡 | 2 |
| 18 | Documentos | link "Categorias" | 🟢 | 2 |
| 19 | Avisos | insert().select() | 🟠 | 3 |
| 20 | Avisos | dp_avisos_leituras | 🟠 | 3 |
| 21 | Mensagens | usar broadcast edge | 🟡 | 3 |
| 22 | Documentos | download iOS | 🟡 | 3 |
| 23 | Hub | atalho notificações | 🟡 | 4 |
| 24 | — | tela notificações | 🟡 | 4 |
| 25 | Notificações | nova rota | 🟢 | 5 |
| 26 | Modelos | preview | 🟢 | 5 |
| 27 | Doc Hub | badge pendentes | 🟢 | 5 |

---

## 4. Recomendação de ordem

1. **Grupo 1** — bugs, cores hardcoded e confirmações de exclusão.
2. **Grupo 2** — filtros, busca, escopo, caixa de entrada.
3. **Grupo 3** — dados/integrações (leituras, broadcast, download iOS).
4. **Grupo 4** — atalho + tela de notificações.
5. **Grupo 5** — melhorias opcionais (preview, badges).

Nenhuma migration necessária: todas as tabelas envolvidas (`dp_avisos`, `dp_avisos_leituras`, `dp_mensagens`, `dp_modelos_mensagem`, `dp_notificacoes`, `dp_documentos`) já existem.

Auditoria DP-G09 concluída. Aguardando aprovação para aplicar Grupos 1-5.
