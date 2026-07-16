# DP-G07 — Auditoria: Área Admin (Folgas, Escalas, Atestados, Disciplinar)

Escopo desta fase (somente leitura):

- `/dp/folgas` (`DpFolgasHub`) — dashboard de folgas.
- `/dp/folgas/calendario` (`DpAdminCalendario`) — sorteio, atribuição, limites.
- `/dp/folgas/geral` (`DpFolgas`) — calendário geral com filtros.
- `/dp/solicitacoes` (`DpSolicitacoes`) — aprovação de solicitações genéricas.
- `/dp/trocas` (`DpTrocas`) — fluxo colega → gestor.
- `/dp/bloqueios` (`DpBloqueios`) — bloqueios de folgas por colaborador.
- `/dp/atestados` (`DpAtestados`) — aprovação de atestados.
- `/dp/disciplinar` (`DpDisciplinar`) — registros disciplinares.

## 1. Mapa de leitura

Todas as queries filtram por `company_id` e respeitam RLS. Tabelas usadas: `dp_colaboradores`, `dp_solicitacoes`, `dp_trocas`, `dp_bloqueios`, `dp_folgas`, `dp_datas_bloqueadas`, `dp_dia_config`, `dp_registros_disciplinares`, `dp_unidades`. Edge functions invocadas: `dp-sorteio-folgas`, `dp-generate-disciplinary-pdf`. RPCs: `dp_processar_troca`, `dp_gerar_bloqueios_ano`.

## 2. Divergências

Legenda: 🔴 crítica · 🟠 alta · 🟡 média · 🟢 baixa.

### DpFolgasHub (dashboard)

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-01 | Botão **"Realizar Sorteio Próximo Mês"** no header não tem `onClick` — cliques não fazem nada. | 🔴 |
| DIV-G07-02 | Stat cards usam `bg-white` hardcoded — quebra dark mode. | 🟡 |
| DIV-G07-03 | Cálculo de capacidade em `ocupacaoPorDia` usa `equipeAtiva * 0.1` como fallback fixo, ignorando `dp_dia_config` (limite por dia já disponível no sistema). Números podem enganar o gestor. | 🟠 |
| DIV-G07-04 | Métrica "OCUPAÇÃO HOJE" mostra `folgasHoje/equipeAtiva` (proporção de folgas contra toda equipe), mas o rótulo sugere ocupação de vagas. Confuso. | 🟡 |

### DpAdminCalendario

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-05 | Dialog do dia lista folgas atuais mas não permite **remover** uma folga já atribuída (apenas adicionar). | 🟠 |
| DIV-G07-06 | `salvarLimite` grava com `unidade_id` **omitido** (não `null` explícito). `onConflict: "company_id,unidade_id,data"` — pode falhar quando o índice único exige `null`. Verificar. | 🟡 |
| DIV-G07-07 | Sem indicador de progresso durante o sorteio (só ícone spinner no botão); resultado em toast desaparece rápido. | 🟢 |

### DpFolgas (calendário geral)

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-08 | Stat cards com `bg-white` hardcoded — quebra dark mode. | 🟡 |
| DIV-G07-09 | Query filtra intervalo usando `.or(...and(...))` como string; sensível a mudanças de sintaxe. Documentar como caso de teste. | 🟢 |
| DIV-G07-10 | `quickAssign` cria solicitação já **aprovada** sem log/auditoria — pula fluxo de aprovação. Aceitável mas deve refletir na UI ("Atribuição rápida ignora aprovação"). | 🟡 |

### DpSolicitacoes

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-11 | Tabs sem **contadores** por status. | 🟢 |
| DIV-G07-12 | Recusa usa `window.prompt` — UX pobre, sem estilo, sem cancelar seguro; melhor Dialog com Textarea. | 🟠 |
| DIV-G07-13 | Sem filtro por **tipo** (folga/férias/atestado/etc) além do status. | 🟡 |
| DIV-G07-14 | Sem confirmação/segurança ao aprovar solicitações de tipos financeiros (adiantamento). | 🟡 |

### DpTrocas

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-15 | Botão **excluir** dispara `del.mutate(t.id)` **sem confirmação** (ícone lixeira direto). | 🟠 |
| DIV-G07-16 | Sem tabs por status; todas as trocas listadas — em bases grandes torna a página lenta e confusa. | 🟡 |
| DIV-G07-17 | Recusa não tem input de motivo obrigatório (grava string fixa "recusada"). | 🟡 |

### DpAtestados

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-18 | Recusa via `window.prompt` (mesmo padrão de DIV-12). | 🟠 |
| DIV-G07-19 | Tabs sem contadores. | 🟢 |
| DIV-G07-20 | Não distingue visualmente atestados com anexo vs. sem anexo antes de abrir preview. | 🟢 |

### DpDisciplinar

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-21 | Exclusão sem confirmação (ícone lixeira direto). | 🟠 |
| DIV-G07-22 | Sem filtros por tipo, colaborador ou período. | 🟡 |
| DIV-G07-23 | Suspensão pede `suspensao_dias` mas não valida `> 0` no submit; apenas número. | 🟢 |
| DIV-G07-24 | Sem indicador de "PDF anexado" separado de "PDF gerado" — usuário não vê qual é qual. | 🟢 |

### DpBloqueios

| ID | Divergência | Gravidade |
|---|---|---|
| DIV-G07-25 | Não visualiza sobreposição entre bloqueios/férias/atestados; risco de conflito silencioso. | 🟢 |

## 3. Correções propostas (aguardando aprovação)

**Grupo 1 — Bugs (aplicar imediatamente):**
- DIV-01: Wire do botão "Realizar Sorteio Próximo Mês" à edge function `dp-sorteio-folgas` para `ano/mes` do próximo mês.
- DIV-02, DIV-08: `bg-white` → `bg-card` em `DpFolgasHub` e `DpFolgas`.

**Grupo 2 — Confirmações e UX de exclusão:**
- DIV-15, DIV-21: `AlertDialog` antes de excluir troca / registro disciplinar.

**Grupo 3 — Dialogs de recusa padronizados:**
- DIV-12, DIV-18, DIV-17: Substituir `window.prompt` por `Dialog + Textarea` (componente `RecusaDialog` reutilizável).

**Grupo 4 — Filtros e contadores:**
- DIV-11, DIV-13, DIV-16, DIV-19, DIV-22: Contadores nas tabs + filtro por tipo em Solicitações; tabs em Trocas; filtros em Disciplinar.

**Grupo 5 — Refinamentos:**
- DIV-03/04: Ocupação por `dp_dia_config` real; rótulos claros.
- DIV-05: Remoção de folga individual no dialog do dia (`DpAdminCalendario`).
- DIV-14: Confirmação extra para aprovar adiantamento.
- DIV-24: Badge "Anexado" vs. "Gerado" em disciplinar.

## 4. Fora do escopo

- Reescrever `dp_sorteio_folgas` (edge function) — apenas se erros aparecerem em produção.
- Auditoria da RPC `dp_processar_troca` — fase separada.

## 5. Bugs corrigidos imediatamente

Todos os 5 grupos aplicados: bugs, confirmações, RecusaDialog, filtros/contadores, capacidade real e remoção de folga individual.

---

**Próxima fase sugerida:** DP-G08 — Cargos, Departamentos, Unidades, Sindicatos, Configurações.
