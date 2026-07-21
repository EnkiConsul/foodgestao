## Objetivo

Reescrever `src/pages/dp/DpAdminCalendario.tsx` para replicar 1:1 a funcionalidade da tela `admin/calendario` do projeto original (Pakere), mantendo o design system do 360°FOOD (paleta laranja/marinho, `DpPage`/`DpContentCard`) e o modelo multiempresa (`company_id`).

## Divergências detectadas (referência × atual)

| # | Recurso na referência | Estado atual em `DpAdminCalendario.tsx` |
|---|---|---|
| 1 | 4 cards de KPI (Folgas Marcadas, Vagas Restantes, Dias Lotados, Capacidade Total) | Ausente |
| 2 | Barra de filtros: Unidade + Colaborador + Tipo (Semanal / Mensal FDS / Pendente) + Limpar | Ausente |
| 3 | Ocupantes por dia combinam **folga fixa semanal** (`dp_colaboradores.folga_fixa_semana`), folgas mensais e **solicitações pendentes** (`dp_solicitacoes`) | Só carrega `dp_folgas` |
| 4 | Prioridade de aniversariante (`dp_prioridade_aniversario`) exibida no dia | Ausente |
| 5 | Realtime nas tabelas `dp_folgas` / `dp_dia_config` / `dp_datas_bloqueadas` | Ausente (só refetch manual) |
| 6 | Detecção de conflitos ao atribuir (mesma semana p/ dias úteis, mesmo mês p/ FDS) + `AlertDialog` com opções **Substituir** / **Manter como Extra** | Ausente — insert direto sem checagem |
| 7 | Dialog do dia mostra bloqueio ativo (motivo, auto/manual) e botão **Liberar Data** | Só lista folgas + limite |
| 8 | Renderização em lista para mobile (`useMediaQuery`) | Só o grid do `FolgaCalendar` |
| 9 | Origem da folga distinguida na UI ("Sorteio Automático" / "Atribuição Manual" / "Extra") | Mostra só `origem` cru |
| 10 | Design chunky (rounded-3xl, tipografia black, cabeçalho com ícone circular) | Layout enxuto padrão do DP |

Itens 3, 6 e 7 são funcionais (podem alterar comportamento de negócio); os demais são UX/visuais.

## Escopo

Reescrever apenas `src/pages/dp/DpAdminCalendario.tsx` e, se necessário, estender `src/components/dp/FolgaCalendar.tsx` para aceitar ocupantes de tipo `fixed` / `pending`. Sem migrações de schema (todos os campos já existem).

### 1. Loader unificado
`useQuery` único que roda em paralelo:
- `dp_folgas` (já existente)
- `dp_datas_bloqueadas` (já existente)
- `dp_dia_config` (já existente)
- `dp_colaboradores` (com `folga_fixa_semana`, `unidade_id`, `ativo=true`) via `useDpColaboradores`
- `dp_unidades` para o filtro
- `dp_solicitacoes` com `status='pendente'` e `tipo` de folga no intervalo
- `dp_prioridade_aniversario` com `status='ativa'` no intervalo

Todas as consultas filtradas por `company_id = selectedCompanyId` e pelo range do mês.

### 2. Filtros (barra superior)
Estados `filterUnidade`, `filterUser`, `filterType` com o comportamento da referência (mudar unidade reseta colaborador). Aplicados no `useMemo` de ocupantes.

### 3. `occupantsByDate` (useMemo)
Para cada dia do mês:
- Se `dp_colaboradores.folga_fixa_semana === weekday` → adiciona ocupante `type: 'fixed'`, origem "Folga Semanal".
- Para cada `dp_folgas` do dia → `type: 'monthly'`, origem = `extra ? 'Extra (Admin)' : criado_por ? 'Atribuição Manual' : 'Sorteio Automático'`.
- Para cada `dp_solicitacoes` pendente do dia → `type: 'pending'`, origem "Solicitação Pendente".

Filtros de unidade/colaborador/tipo aplicados antes de inserir.

### 4. KPIs (`stats` useMemo)
Somando por dia útil do mês: `totalFolgas`, `totalVagas` (soma dos limites com fallback 1), `diasLotados` (ocupação ≥ limite), `vagasRestantes`.

### 5. Realtime
`useEffect` com canal Supabase escutando `dp_folgas`, `dp_dia_config`, `dp_datas_bloqueadas`, `dp_solicitacoes` → `queryClient.invalidateQueries` das chaves relevantes.

### 6. Atribuição com conflito
Ao clicar "Atribuir":
1. Buscar `dp_folgas` do colaborador (mesmo `company_id`).
2. Considerar conflito: mesma data, ou (FDS) mesmo mês, ou (dia útil) mesma semana ISO.
3. Sem conflito → insert direto.
4. Com conflito → abrir `AlertDialog` com dois `AlertDialogAction`: **Substituir** (delete conflitos + insert normal) / **Manter como Extra** (insert com `extra=true`).

Reaproveitar helpers `isSameWeek` / `monthKey` (criar em `src/lib/dp/folga-rules.ts` se ainda não existirem — usar utilitários de `date-fns` para não duplicar).

### 7. Dialog do dia
Estrutura da referência (usando `DpCalendarDayDialog` já existente onde couber):
- Cabeçalho com ícone + data em destaque.
- Bloco vermelho se dia bloqueado (motivo + badge auto/manual + botão "Liberar Data").
- Bloco "Configuração do Dia" (apenas em FDS) com input de limite e "Salvar".
- Lista "Escala do Dia" com dot colorido por tipo, origem em uppercase e botão trash (só em `type='monthly'`).
- Bloco "Atribuir Folga Manual" com select + botão que dispara `prepararAtribuicao`.

### 8. Vista mobile
`useMediaQuery('(max-width: 768px)')` renderiza lista dia-a-dia com badge de ocupação `n/limite` e chips com primeiro nome, no mesmo estilo da referência (adaptado ao tema 360°FOOD com tokens semânticos — sem `bg-white`/`text-slate-*` hardcoded).

### 9. Estilo
Manter tokens do design system 360°FOOD:
- Substituir `bg-white`/`text-slate-*` da referência por `bg-card`/`text-foreground`/`text-muted-foreground`.
- Acento primário laranja via `text-primary` / `bg-primary/10`.
- Cards com `rounded-2xl`/`rounded-3xl` conforme referência, dentro de `DpContentCard`.

### 10. Fora de escopo
- Sem alterações em `dp-sorteio-folgas` (edge function) — botão "Sortear folgas do mês" e "Gerar bloqueios do ano" permanecem como estão.
- Sem novas migrações.
- Sem mudanças em outras telas do módulo DP.

## Riscos / notas técnicas

- **Recursão RLS**: `dp_solicitacoes` e `dp_prioridade_aniversario` precisam de `select` permitido para admin do tenant — validar antes; se faltar policy é escopo separado.
- **`folga_fixa_semana`** pode estar `null` para colaboradores importados — tratar como "sem folga fixa".
- **Semana ISO**: usar `date-fns/getISOWeek` + ano ISO para o cálculo, não semana calendária, para bater com a regra Pakere.

## Entregável
Um único arquivo alterado: `src/pages/dp/DpAdminCalendario.tsx` (+ helper opcional em `src/lib/dp/folga-rules.ts` se necessário para `isSameWeek`/`monthKey`).
