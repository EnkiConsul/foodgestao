## Objetivo

Reproduzir 1:1 no 360°FOOD a lógica de folgas do Pakere:

1. Folgas semanais fixas (`dp_colaboradores.folga_fixa_semana`) aparecem em **todas** as telas de calendário (admin e portal do colaborador).
2. Ocupação = folgas fixas + folgas registradas (`dp_folgas`) + pendentes (`dp_solicitacoes`), como no `Admin_Folgas_Hub.txt` linha 57 (`todayFixed = profilesAtivos.filter(p => p.folga_fixa_semana === now.getDay())`).
3. Regras de status por dia (`fixed`, `mine`, `swapped`, `available`, `taken`, `blocked`, `pending`, `birthday`, `past`, `weekday`) unificadas em `src/lib/dp/folga-rules.ts`, seguindo `lib_Folgas_Rules.txt`.

## Diagnóstico do bug reportado

O loop de fixadas em `DpAdminCalendario.tsx:255-272` está correto na estrutura, mas depende de `useDpColaboradores()` — que hoje traz **todos** os colaboradores (ativos e inativos) e sem filtro de mês. O problema mais provável (a verificar no primeiro passo): `folga_fixa_semana` chega como `string` em runtime por causa do TS `Row` (o Postgres retorna `smallint` → JS `number`, mas o cast `c.folga_fixa_semana !== wd` falha quando alguém salva "3" como texto). Vou:

- Logar no dev-tools uma amostra de `filteredColabs[0].folga_fixa_semana` (tipo + valor) e confirmar em Playwright.
- Normalizar para `Number(c.folga_fixa_semana)` antes da comparação — fix defensivo.

Se após normalizar continuar sem aparecer, o próximo passo é auditar `useDpColaboradores` (verificar se `select("*")` está trazendo a coluna e se RLS não corta o retorno).

## Escopo

### 1. Novo arquivo `src/lib/dp/folga-rules.ts`
Porta enxuta do `lib_Folgas_Rules.txt` adaptada ao schema 360°FOOD:

- Helpers: `ymd`, `parseYMD`, `monthKey`, `isWeekend`, `dayType`, `getWeekStart`, `isSameWeek`, `formatBR`, `getMonthDays`.
- Tipos `DateStatusKind`, `DateStatus`, `FolgaRecord` (`{ colaborador_id, data, tipo, extra }`), `ColaboradorRecord` (`{ id, folga_fixa_semana, ativo, unidade_id }`).
- `calculateDateStatus(...)` idêntica ao Pakere, trocando `user_id`→`colaborador_id` e `profiles`→`dp_colaboradores`.
- `buildOccupantsByDate(range, colabs, folgas, pendentes, filtros)` — extraído de `DpAdminCalendario` para reuso, com normalização `Number(folga_fixa_semana)` e filtro `ativo=true` para fixadas.

### 2. Novo componente `src/components/dp/FolgaCalendarShared.tsx`
Substitui o `FolgaCalendar.tsx` atual, seguindo `Folga_Calendar.txt`:

- Props: `year`, `month0`, `occupantsByDate`, `manualBlocked`, `dayLimits`, `birthdayByDate`, `myColaboradorId`, `allFolgas`, `allColabs`, `pendingRequests`, `isAdmin`, `onSelectDay`, `onPrev`, `onNext`, `locked`.
- Renderiza grid desktop + lista mobile (`useMediaQuery('max-width: 768px)').`
- Estilos convertidos para tokens 360°FOOD: `bg-emerald-50/40`→`bg-success/10`, `bg-rose-*`→`bg-destructive/10`, `bg-primary/10` mantém laranja, `bg-blue-*` (fixed) e `bg-amber-*` (monthly) e `bg-violet-*` (pending) mantêm sinal semântico das cores originais.
- Chips de ocupantes coloridos por `type: fixed | monthly | pending` (paridade com Pakere).
- Legenda no rodapé: Disponível / Folga Semanal / Folga Mensal / Pendente / Bloqueado.
- Mantém `rounded-3xl` chunky do Pakere para o admin; portal usa versão mais discreta via prop `variant`.

### 3. Reescrita de `src/pages/dp/DpAdminCalendario.tsx`

- Substitui grid inline por `<FolgaCalendarShared isAdmin variant="chunky" .../>`.
- `occupantsByDate` agora vem de `buildOccupantsByDate`.
- Fix normalização `Number(folga_fixa_semana)`.
- Passa a filtrar `colabs.ativo === true` para fixadas (paridade com Pakere linha 42).
- KPIs (`stats`) contam fixadas + monthly + pendentes por dia — hoje já contam ocupantes, só fica consistente.
- Detecção de conflito, dialog do dia, "Liberar Data", sorteio: **mantidos como estão**.

### 4. Reescrita de `src/pages/dp/portal/DpMeuCalendario.tsx`

- Buscar também o próprio `dp_colaboradores` (id, folga_fixa_semana, ativo) — já existe via `meRef`.
- Buscar lista de todos os colabs ativos da empresa (só id + nome + folga_fixa_semana) para popular `allColabs` no `calculateDateStatus`.
- Buscar `dp_solicitacoes` pendentes do próprio colaborador.
- Montar `occupantsByDate` incluindo folga fixa semanal do próprio + folgas registradas + pendências.
- Renderizar `<FolgaCalendarShared isAdmin={false} myColaboradorId={me.id} .../>`.
- Preservar navegação para `/dp/meu/solicitacoes?data=<iso>` no `onSelectDay`.

### 5. Ajuste em `src/pages/dp/DpFolgasHub.tsx`

- KPI "Folgas Hoje" passa a incluir **folgas fixas semanais**: `folgasHoje = solicitacoesAprovadasHoje + folgasRegistradasHoje + colabsAtivosComFolgaFixa(hoje.dow)` (paridade com `Admin_Folgas_Hub.txt:65`).
- Query adicional em `dp_folgas` no mês (hoje só usa `dp_solicitacoes`).
- Fetch de `dp_colaboradores(id, ativo, folga_fixa_semana)` — reaproveita a query que já existe, apenas adiciona `folga_fixa_semana` ao select.

### 6. Migração/depreciação de `src/components/dp/FolgaCalendar.tsx`

Manter o arquivo antigo removido do repositório (`rm`) para evitar duas versões — nenhum outro consumidor usa fora das duas telas acima (confirmar com `rg`).

## Riscos / notas técnicas

- **RLS de `dp_colaboradores`**: policy atual restringe leitura de PII; a query do portal precisa apenas de `id, nome, folga_fixa_semana` — validar que a policy permite leitura destes campos para colaborador do mesmo tenant. Se cortar, expor uma view `dp_colab_public` (fora deste plano, escalar como issue).
- **Tipagem**: `folga_fixa_semana` em `types.ts` é `number | null`. Normalização via `Number()` é defensiva contra dados legados importados como texto (Pakere legacy).
- **Semana ISO vs semana calendária**: o Pakere usa `getWeekStart` (segunda-feira). A regra de conflito atual do admin (`isoWeekKey`) já é ISO. Manter ambas: admin usa ISO (conflito de sorteio), portal usa `isSameWeek` (mesma-semana para status "já folgou").
- Sem migração de schema; todos os campos já existem.

## Entregáveis

- `src/lib/dp/folga-rules.ts` (novo)
- `src/components/dp/FolgaCalendarShared.tsx` (novo)
- `src/pages/dp/DpAdminCalendario.tsx` (refatorado, ~200 linhas menores)
- `src/pages/dp/portal/DpMeuCalendario.tsx` (refatorado)
- `src/pages/dp/DpFolgasHub.tsx` (ajuste no KPI "Folgas Hoje" + query)
- `src/components/dp/FolgaCalendar.tsx` (removido)

## Verificação pós-implementação

Via Playwright em `localhost:8080`:

1. `/dp/calendario` — trocar mês e conferir chips azuis "Folga Semanal" em segundas/quartas/quintas para colabs com `folga_fixa_semana` setado.
2. `/dp/meu/calendario` — logado como colaborador com `folga_fixa_semana=3`, ver dias de quarta marcados como `fixed` com badge "Semanal".
3. `/dp/folgas` — KPI "Folgas Hoje" reflete fixadas quando hoje é o dia semanal de alguém.
