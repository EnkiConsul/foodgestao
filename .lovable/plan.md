# Marcação direta de folga — colaborador (paridade Pakere)

## Diagnóstico

- **RLS atual de `dp_folgas`**: só `dp_folgas_admin_write` (admin/owner). Qualquer INSERT do colaborador retorna 403. Por isso os 4 POSTs falharam nos logs.
- **Frontend**: `marcarFolga` em `DpMeuCalendario.tsx` já valida "1 folga de fim de semana por mês" client-side, mas **não** valida lotação, bloqueio manual, aniversariante nem folga fixa antes do INSERT.
- **Trigger existente `dp_solicitacoes_validar`**: só roda em `dp_solicitacoes`, não em `dp_folgas`.

## O que muda

### 1. Backend — permitir INSERT do colaborador em `dp_folgas` (com trave dura)

Migração:

- **Nova policy** `dp_folgas_self_insert` em `dp_folgas` (INSERT, role `authenticated`) permitindo `colaborador_id = private.dp_colaborador_of(auth.uid())` **e** `company_id` bater. Sem SELECT/UPDATE/DELETE — quem pode alterar depois continua sendo admin ou o dono via policy dedicada.
- **Nova policy** `dp_folgas_self_delete` (DELETE) para o colaborador remover **apenas** sua própria folga futura, origem `solicitacao`, status `agendada` e criada por ele.
- **Nova trigger `dp_folgas_validar_self`** (BEFORE INSERT) — dispara **apenas** quando o autor não é admin/owner. Refaz no banco todas as regras (defesa em profundidade):
  1. `data >= current_date` (sem data passada).
  2. `tipo = 'normal'` e `extra = false` e `origem = 'solicitacao'` (bloqueia forjar `extra`/`sorteio`).
  3. Dia da semana ∈ {0,6}.
  4. Limite mensal: 0 folgas de fim de semana ativas no mês (excluindo canceladas).
  5. Lotação: `count(dp_folgas ativos naquele dia) < coalesce(dp_dia_config.limite_folgas, 1)` — com precedência da linha `unidade_id` do colaborador sobre `NULL`.
  6. `dp_datas_bloqueadas` não bloqueia (respeitando `unidade_id` e `liberada_por_solicitacao`).
  7. Aniversariante ativo naquele dia ≠ colaborador → RAISE.
  8. Folga fixa semanal do próprio colaborador cai naquele weekday → RAISE (usa `solicitacao especial`/exceção).
  9. Já existe folga sua nesse dia → RAISE.
- Mensagens de erro em pt-BR, específicas por regra (o front mapeia para `toast.error`).

### 2. Frontend — `src/pages/dp/portal/DpMeuCalendario.tsx`

Refatorar `marcarFolga` para validar antes do INSERT (mesmas 9 regras acima), reaproveitando `calculateDateStatus`/helpers de `folga-rules.ts`:

- Checar `dayType` (fim de semana).
- Contar folgas de fim de semana no mês do colaborador (`tipo` normal + weekday, `extra=false`, `status<>'cancelada'`).
- Contar ocupados do dia com o limite efetivo (`dayLimits` já leva unidade em conta).
- Consultar `manualBlocked` do dia.
- `birthdayByDate` (nova query — hoje não é buscada nesta página; adicionar `useQuery` para `dp_prioridade_aniversario` do mês, filtrado por unidade).
- Folga fixa do próprio colaborador vs `date.getDay()`.
- Mensagens de toast idênticas às especificadas.

Após validar, INSERT em `dp_folgas` com `tipo='normal'`, `extra=false`, `origem='solicitacao'`, `status='agendada'`, `criado_por=user.id`. Em caso de 403 residual, cair no toast genérico.

O botão do dialog:

- Mostra **"Marcar folga"** apenas quando o status calculado for `available` **e** fim de semana **e** nenhuma das regras 4-9 falhar (pré-check síncrono para o botão já vir habilitado/desabilitado com tooltip do motivo).
- Nos demais casos permanece **"Solicitar exceção"** já existente.

Remover folga (`removerFolga`) continua igual — agora funciona porque temos policy DELETE self.

### 3. Verificação

- `supabase--linter` pós-migração.
- Query manual: reproduzir INSERT como colaborador (via `supabase--read_query` não dá; será verificado no preview autenticado).
- Testes manuais no preview (Playwright): tentar marcar em (a) sábado disponível → sucesso; (b) mesmo mês outro fim de semana → toast de limite mensal; (c) dia bloqueado → toast bloqueio; (d) dia lotado (limite=1 já ocupado) → toast lotado; (e) dia útil → botão some, só exceção.

## Arquivos

- **Nova migração** (backend): policy INSERT/DELETE + trigger `dp_folgas_validar_self`.
- `src/pages/dp/portal/DpMeuCalendario.tsx`: `marcarFolga` completo + `useQuery` de aniversariantes + gating do botão.

## Detalhes técnicos

- A trigger usa `SECURITY DEFINER` + `search_path=public` e faz `IF private.is_company_admin_or_owner(auth.uid(), NEW.company_id) THEN RETURN NEW; END IF;` no topo para não afetar o fluxo do admin.
- `dp_folgas_self_insert` só permite `origem='solicitacao'` e `criado_por = auth.uid()` no `WITH CHECK`, evitando forjar `sorteio`.
- Rate-limit não é adicionado agora (fluxo é bloqueado por regras de negócio; limite mensal já é 1).

Sem alterações em outras páginas.
