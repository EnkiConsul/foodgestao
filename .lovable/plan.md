## Causa

O botão "Liberar Data" faz `upsert` em `dp_datas_bloqueadas` com `onConflict: "company_id,unidade_id,data"`, mas a tabela não tem esse índice único. O Postgres devolve `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification` e o `toast` renderiza `[object Object]`.

Confirmado no banco: `dp_datas_bloqueadas` só possui PK em `id` e as FKs — nenhum UNIQUE em `(company_id, unidade_id, data)`.

## Correção

1. **Migração SQL** — criar dois índices únicos parciais (necessário porque `unidade_id` é NULL para bloqueios globais e NULL não deduplica em UNIQUE comum):
   ```sql
   CREATE UNIQUE INDEX dp_datas_bloqueadas_unique_global
     ON public.dp_datas_bloqueadas (company_id, data)
     WHERE unidade_id IS NULL;
   CREATE UNIQUE INDEX dp_datas_bloqueadas_unique_unidade
     ON public.dp_datas_bloqueadas (company_id, unidade_id, data)
     WHERE unidade_id IS NOT NULL;
   ```
   Antes de criar, deduplicar linhas existentes que violem o índice (manter a mais recente por `(company_id, coalesce(unidade_id,'00000000-…'), data)`).

2. **Frontend** — `src/pages/dp/DpFolgas.tsx` e `src/pages/dp/DpAdminCalendario.tsx`: no `onError` do mutation `liberarData`, formatar a mensagem (`err?.message ?? String(err)`) para nunca cair em `[object Object]`. Ajustar o `upsert` a usar `onConflict` correspondente ao índice parcial ativo (mesmo target string funciona; PostgREST casa com o índice parcial se o `WHERE` for coberto pelo payload).

## Verificação

- Clicar em "Liberar Data" no dia 08/08/2026 → registro é upsertado com `liberada = true`, a célula volta a "disponível" e o dialog fecha.
- Segundo clique em outra data já bloqueada não gera duplicata.
- Erro simulado (ex.: remover permissão) mostra mensagem legível no toast.

## Arquivos

- `supabase/migrations/*` — novo arquivo com os dois índices únicos parciais + limpeza de duplicatas.
- `src/pages/dp/DpFolgas.tsx` — melhorar mensagem de erro do `liberarData`.
- `src/pages/dp/DpAdminCalendario.tsx` — mesma melhoria de mensagem (paridade).