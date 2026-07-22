
# Ajustar Calendário Admin: exibição e liberação de datas bloqueadas (v2)

## Diagnóstico do estado atual (verificado)

Já funciona em `src/pages/dp/DpAdminCalendario.tsx` + `src/components/dp/FolgaCalendarShared.tsx`:

- Regras (`dp_bloqueio_regras`) são expandidas via `buildBloqueiosDeRegras` e mescladas com bloqueios manuais em `manualBlocked` e `blockedByDate`.
- A célula do calendário já aplica `bg-destructive/15 border-destructive/40`, badge **Bloqueado**, ícone `Lock` e oculta o chip de ocupação quando `status === "blocked"`.
- O dialog do dia já mostra bloco vermelho com "Data Bloqueada", badge **Automático/Manual**, motivo e botão **Liberar Data** (é o que aparece no print anexo).

Gaps reais:

1. **Botão "Liberar Data" não libera bloqueios de regra.** `liberarData` só faz `DELETE` em `dp_datas_bloqueadas` — dia bloqueado só por regra dinâmica não tem linha lá, então o clique não faz nada.
2. **Semântica de "liberado" está amarrada a solicitação.** `dp_datas_bloqueadas.liberada_por_solicitacao` é FK para `dp_solicitacoes(id)`; sem flag boolean o admin não consegue liberar manualmente.
3. **Filtro de unidade não é honrado.** `buildBloqueiosDeRegras` recebe `unidadeId: null` fixo.
4. **Tooltip** do dia bloqueado poderia mostrar o motivo (opcional).

## Alterações

### 1. Migração SQL

- `ALTER TABLE public.dp_datas_bloqueadas ADD COLUMN liberada boolean NOT NULL DEFAULT false;`
- Atualizar **três** funções para tratar `liberada = true` como equivalente a `liberada_por_solicitacao IS NOT NULL`:
  - `public.dp_regra_bloqueia_data(company_id, unidade_id, data)` — retorna `false` (não bloqueia) quando existir linha em `dp_datas_bloqueadas` para a data com `liberada = true OR liberada_por_solicitacao IS NOT NULL`, cobrindo escopo `unidade_id IS NULL OR unidade_id = p_unidade_id`. Só depois avalia regras.
  - `public.dp_folgas_validar_self()` — nos blocos 5a (manual) e 5b (regra), a checagem `IS NULL` vira `liberada_por_solicitacao IS NOT NULL OR liberada = true`.
  - `public.dp_validar_solicitacao_folga()` — mesma alteração nos pontos equivalentes.

### 2. `src/pages/dp/DpAdminCalendario.tsx` — mutação `liberarData` correta

```ts
const unidadeIdParaUpsert = filterUnidade === "all" ? null : filterUnidade;
await supabase.from("dp_datas_bloqueadas").upsert(
  {
    company_id: selectedCompanyId!,
    data: dayOpen,
    unidade_id: unidadeIdParaUpsert,
    liberada: true,
    motivo: "Liberado manualmente pelo administrador",
    criado_por: userRes.user?.id ?? null,
  },
  { onConflict: "company_id,unidade_id,data" },
);
```

- Se "Todas as unidades" → libera globalmente (`unidade_id = null`).
- Se filtrando uma unidade → libera só para aquela unidade.
- Após sucesso, invalida `["dp_datas_bloqueadas"]` (Realtime já cobre; força refresh imediato).

### 3. `useMemo` de `manualBlocked` e `blockedByDate` (mesmo arquivo)

- Ignorar linhas com `liberada === true` **e** com `liberada_por_solicitacao != null`. Ordem: manuais primeiro (com esse filtro), depois preencher com regras expandidas apenas onde ainda não há bloqueio válido.
- Se existir linha manual com `liberada = true` para a data, ela **suprime** também o bloqueio de regra (a expansão só entra quando o Map ainda não tem a chave — precisamos adicionar um `Set` separado de "liberadas" para skipar regras nesses dias).

### 4. Filtro de unidade no motor

- Chamada de `buildBloqueiosDeRegras` passa:
  - `vinculos: regrasData.vinculos`
  - `unidadeId: filterUnidade === "all" ? null : filterUnidade`
- Em `src/lib/dp/bloqueio-rules.ts`, ajustar o guard para: quando `unidadeId === null` incluir **todas** as regras (mesmo vinculadas); quando setado, incluir globais + vinculadas àquela unidade. Substitui o `continue` atual por `if (unidades.length > 0 && unidadeId && !unidades.includes(unidadeId)) continue;`.

### 5. `src/components/dp/FolgaCalendarShared.tsx` — tooltip

- Setar `tooltip = manualBlocked.get(iso)?.reason` nas células com `status === "blocked"` e usar `title={tooltip}` (ou o `TooltipProvider` já importado) para hover.

## Fora de escopo

- Layout do dialog, KPIs, filtros de colaborador/tipo, mutações de sorteio/atribuição/limite.
- Nova UI para gerenciar override em massa.

## Verificação

1. `08/08/2026` no admin: fundo vermelho + badge **Bloqueado**; dialog mostra motivo da regra Pós-Pagamento com badge **Automático**.
2. Clicar **Liberar Data** insere linha em `dp_datas_bloqueadas` com `liberada = true`; célula perde vermelho e passa a mostrar chip de ocupação.
3. Marcar folga naquele dia passa nas triggers (nenhum "bloqueada por regra" após liberação).
4. Filtrando uma unidade específica: regras vinculadas a outras unidades **não** aparecem; regras globais continuam aparecendo; liberação fica escopada àquela unidade.
5. Bloqueio manual criado em "Datas Bloqueadas" comporta-se igual (pode ser liberado e retomar bloqueio ao remover a liberação).
6. Tooltip no hover mostra o motivo do bloqueio.
