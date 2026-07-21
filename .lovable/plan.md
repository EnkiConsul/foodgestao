## Comparativo Pakere × 360°FOOD (`/dp/meu/calendario`)

O calendário atual só exibe o mês e, ao clicar num dia, redireciona para `/dp/meu/solicitacoes` — o usuário perdeu quase todo o auto-atendimento que existia no Pakere. Vou replicar as funcionalidades faltantes, com o backend do 360°FOOD.

### O que falta hoje

| Recurso (Pakere) | Status no 360°FOOD |
|---|---|
| Dialog do dia com **status** e **ocupantes** | Ausente |
| **Marcar folga** direto (1 clique em fim de semana disponível) | Ausente — só via aprovação |
| **Remover folga** própria futura | Ausente |
| **Solicitar troca** com um ocupante do dia | Ausente no calendário (só em `/dp/meu/trocas`) |
| **Solicitar exceção** (dia bloqueado/lotado) | Ausente |
| Filtro por **unidade** ao computar ocupantes | Já feito no back, mas ocupantes vêm de toda empresa no front |
| **Realtime** (folgas, bloqueios, dia_config, solicitações) | Ausente |
| Regra **1 folga de fim de semana por mês** | Não validada no front |

## Escopo aprovado

- **Marcar folga = direto igual Pakere** → `insert into dp_folgas` (trigger `dp_validar_folga_insert` já bloqueia limite/data bloqueada/bloqueio individual).
- **Exceção** → reaproveita `dp_solicitacoes` com `tipo='folga'` + motivo obrigatório.
- **Troca** → cria linha em `dp_trocas` a partir do dialog.

## Mudanças

### 1. `src/pages/dp/portal/DpMeuCalendario.tsx` — reescrita da interação

Substituir `onSelectDay` (que hoje navega) por um **dialog** contendo:

- Cabeçalho com data BR + badge de status (available/mine/fixed/blocked/taken/past/pending/birthday/swapped).
- Se ocupado por outros → lista de ocupantes com botão **Trocar** ao lado de cada nome (mesma unidade).
- Bloco de ações contextual:
  - `available` (fim de semana) → botão **Marcar folga** (insere em `dp_folgas` com `tipo = sabado|domingo`, `extra=false`, `criado_por=user.id`).
  - `mine` → botão **Remover folga** (só se `data >= hoje`; `delete from dp_folgas where id=…`).
  - `fixed` → texto explicativo + dica de troca.
  - `blocked` / `taken` / `past` / `pending` / `birthday` / `swapped` → mensagem informativa.
- Botão **Solicitar exceção** (visível quando status ∈ blocked/taken/available/birthday) → abre segundo dialog com Textarea de motivo → `insert into dp_solicitacoes { tipo:'folga', data_alvo:iso, motivo }`.
- Validação client-side **1 folga fim de semana por mês** antes de inserir (contando `dp_folgas` do próprio user no mês, `tipo ∈ (sabado, domingo)`, `extra=false`) — igual ao Pakere.
- Após qualquer mutação, `queryClient.invalidateQueries` para recarregar.

### 2. Filtro por unidade

Ao montar `occupantsByDate`, filtrar `colaboradores` pela `unidade_id` do usuário (se ele tiver), igual `filteredProfiles` do Pakere. Hoje `buildOccupantsByDate` recebe todos.

### 3. Realtime

Subscribe em `dp_folgas`, `dp_datas_bloqueadas`, `dp_dia_config`, `dp_solicitacoes` (filtrando por `company_id`) → `invalidateQueries` das 4 queries do calendário. Cleanup no unmount.

### 4. Troca via calendário

Ação **Trocar** ao lado de um ocupante:
- Validação: não pode ser eu mesmo; ocupante e eu devem ter a mesma `unidade_id` (skip se admin — colaborador nunca é admin nessa tela).
- Verifica duplicidade: `select id from dp_trocas where solicitante_id=me and destino_id=X and data_original=iso and status='pendente'`.
- Insert: `{ company_id, solicitante_id: me, destino_id: X, data_original: iso, motivo: 'Solicitação via calendário', status: 'pendente' }`.
- Como `dp_trocas` exige `data_proposta`? Se coluna for NOT NULL, usar a minha própria folga fixa/mensal como proposta; se nulo permitido, deixar `null`. **Verificar no build.**

### 5. `src/lib/dp/folga-rules.ts`

Nenhuma alteração — `calculateDateStatus` já cobre todos os status usados no dialog. Vou apenas usar `getWeekStart`, `parseYMD`, `dayType`, `monthKey` (já existem) para a regra de 1 folga/mês e para computar `canTrade`.

### 6. Sem migração

- Tudo suportado pelo schema atual. Triggers de validação em `dp_folgas` continuam sendo a fonte de verdade no servidor.
- `dp_solicitacoes` já tem a trigger `dp_solicitacoes_validar` que acabamos de criar (bloqueia insert em dia lotado). Exceções também caem nela — comportamento correto (não deixa "trapacear" via botão de exceção com data lotada). Se o produto quiser permitir exceção mesmo em dia lotado, ajustamos a trigger depois; por ora mantém.

## Verificação

1. Colaborador clica em sábado disponível → dialog mostra "Disponível" + botão "Marcar folga" → 1 clique grava em `dp_folgas`, atualização em tempo real reflete no calendário.
2. Clica em sua própria folga futura → botão "Remover folga" funciona.
3. Clica em dia lotado → status "Ocupado", vê ocupantes da sua unidade + botão "Trocar" ao lado de cada um.
4. Clica em dia bloqueado → botão "Solicitar exceção" cria pendência em `dp_solicitacoes`.
5. Tentativa de marcar 2ª folga de fim de semana no mesmo mês → toast "Você já possui uma folga de fim de semana neste mês".
6. Alteração feita por outro dispositivo aparece via realtime sem refresh.