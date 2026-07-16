# Auditoria DP-G04 — Folgas do Colaborador

**Escopo:** `/dp/meu/calendario`, `/dp/meu/solicitacoes`, `/dp/meu/trocas`, `/dp/meu/historico`.
**Referência:** `pakere1996/portalcolaborador` — módulo *Folgas do Colaborador*.
**Data:** 2026-07-16
**Modo:** somente leitura + correção de bugs de query quebrada (ver §6).

Legenda status: **Conforme** · **Parcial** · **Divergente** · **Ausente** · **Extra**
Legenda gravidade: 🔴 crítica · 🟠 alta · 🟡 média · 🟢 baixa

---

## 1. Mapa de rotas

| Rota | Componente | Doc | Status |
|---|---|---|---|
| `/dp/meu/calendario` | `DpMeuCalendario` | Calendário | Conforme |
| `/dp/meu/solicitacoes` | `DpMeuSolicitacoes` | Solicitações | Parcial |
| `/dp/meu/trocas` | `DpMeuTrocas` | Trocas | Parcial |
| `/dp/meu/historico` | `DpMeuHistorico` | Histórico | **Divergente (bugs)** |

---

## 2. `/dp/meu/calendario`

- Renderiza `FolgaCalendar` com folgas da empresa toda + destaque do próprio colaborador.
- Consulta `dp_folgas`, `dp_datas_bloqueadas`, `dp_dia_config`. **OK.**

Divergências:
- **DIV-G04-01 · 🟡** — Não há botão *"Solicitar folga a partir do dia X"* ao clicar em uma data (existe `DpCalendarDayDialog` no admin; a doc pede o mesmo no portal).
- **DIV-G04-02 · 🟢** — Filtros por *tipo* (folga/atestado/férias) não expostos ao colaborador — na doc há chips de filtro.

## 3. `/dp/meu/solicitacoes`

Divergências:
- **DIV-G04-03 · 🟡** — Form usa `<Input type="date">` nativo; doc pede `Popover + Calendar` shadcn (consistência visual).
- **DIV-G04-04 · 🟡** — Falta validação: `data_alvo` obrigatório, `data_fim >= data_alvo`, motivo obrigatório se `tipo != folga`.
- **DIV-G04-05 · 🟡** — Falta indicação de *bloqueio de data* (checar `dp_datas_bloqueadas`) antes de permitir envio.
- **DIV-G04-06 · 🟢** — Sem botão *"Cancelar solicitação"* quando `status = pendente`.
- **DIV-G04-07 · 🟢** — Sem filtro por status (pendente / aprovada / recusada) — doc mostra tabs.

## 4. `/dp/meu/trocas`

Divergências:
- **DIV-G04-08 · 🟠** — Não há tela / dialog de **criar nova troca**. Só lista e responde. Doc prevê botão *"Propor troca"* que escolhe colega + data original + data proposta.
- **DIV-G04-09 · 🟡** — Falta legenda de fluxo (colega → gestor). Doc traz badge de etapa atual visualmente destacado.
- **DIV-G04-10 · 🟢** — Sem separação visual entre trocas *recebidas* (destino = eu) e *enviadas* (solicitante = eu).

## 5. `/dp/meu/historico`

**Bugs de query (queries falham em runtime):**

- **DIV-G04-11 · 🔴** — `dp_trocas` referenciado com `parceiro_id` — **coluna inexistente**. Correta: `destino_id`. Resultado atual: nenhuma troca aparece no histórico (ou erro silencioso).
- **DIV-G04-12 · 🔴** — `dp_documentos` referenciado com coluna `categoria` — **coluna inexistente**. Correta: `tipo`. Resultado atual: título vem como `undefined` fallback.

Divergências funcionais:
- **DIV-G04-13 · 🟡** — Falta filtro por tipo de evento (Solicitação / Troca / Documento / Disciplinar).
- **DIV-G04-14 · 🟢** — Sem paginação/limite dinâmico (hoje: 50 sols, 30 trocas, 50 docs, 20 disc).

---

## 6. Correções aplicadas nesta fase (bugs de runtime)

- **DIV-G04-11** — `parceiro_id` → `destino_id` em `DpMeuHistorico.tsx`.
- **DIV-G04-12** — `categoria` → `tipo` em `DpMeuHistorico.tsx`.

Nenhuma alteração de schema, RLS ou storage.

---

## 7. Correções sugeridas — aguardando aprovação

| Grupo | IDs | Escopo |
|---|---|---|
| **Frontend puro** | DIV-G04-02, 03, 04, 06, 07, 09, 10, 13, 14 | Ajustes de UI, filtros, validações, tabs |
| **Frontend + fluxo novo** | DIV-G04-01 (dialog no calendário), 05 (checagem de bloqueio), 08 (criar troca) | Formulário/dialog novos |

## 8. Próxima fase sugerida

- **DP-G05 — Documentos do Colaborador**: `/dp/meu/documentos`, `/dp/meu/atestados`, `/dp/meu/disciplinar`, `/dp/meu/sindicato`.

---

Auditoria DP-G04 concluída. Apenas os bugs de runtime foram corrigidos automaticamente. Aguardando aprovação para aplicar as demais correções ou avançar para DP-G05.
