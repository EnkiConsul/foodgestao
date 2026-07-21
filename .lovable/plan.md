# Correção: horário da última sincronização exibido em UTC

## Diagnóstico

O horário 18:51 mostrado no card "Última sincronização" corresponde ao valor UTC bruto do `last_sync_at` retornado pelo backend, sem conversão para o fuso do Brasil. Se agora são 16:01 BRT (19:01 UTC), o sync real ocorreu há ~10 minutos e deveria aparecer como **15:51**, não 18:51.

A causa está em `src/lib/date-utils.ts` → `parseFlexibleDate` (linhas 28–76):

- A regex ISO captura ano/mês/dia/hora/min/seg de strings como `2026-07-21T18:51:00Z` ou `...+00:00`, mas **descarta o sufixo `Z`/offset**.
- Em seguida usa `new Date(year, month-1, day, hours, minutes, seconds)`, que interpreta esses componentes como **hora local**.
- Resultado: 18:51 UTC vira 18:51 BRT em vez de 15:51 BRT.

Isso afeta todo lugar que passa timestamps ISO com `Z`/offset por `formatDate` — hoje visível no Open Finance (última sync geral, sync por conexão e sync por conta provedora), e potencialmente em outras telas que exibem `HH:mm` de campos `timestamptz`.

## Correção

Ajustar `parseFlexibleDate` em `src/lib/date-utils.ts` para que strings ISO **com componente de horário** sejam delegadas ao construtor nativo `new Date(raw)`, que respeita `Z` e offsets explícitos. O ramo "date-only" (`YYYY-MM-DD` sem `T…`) continua com a construção local atual, preservando a proteção contra o shift de fuso para datas puras (ex.: `due_date`).

Fluxo novo dentro do bloco `if (iso)`:

```text
- iso[4] presente (tem horário)  → return new Date(raw)  // respeita Z/offset
- iso[4] ausente (só data)       → mantém lógica local com defaults de DayTime
```

O ramo `dmy` (`DD/MM/YYYY`) e o fallback genérico permanecem inalterados.

## Verificação

1. Reabrir `/contas-bancarias` → card "Última sincronização" deve mostrar horário BRT coerente com o relógio do usuário.
2. Conferir "Última sync" do cartão da conexão e o `sync HH:mm` da conta provedora.
3. Rodar `bun test src/lib/__tests__` (se existirem testes de date-utils) e a suíte de tenancy para garantir que nenhuma comparação de data quebrou.
4. Confirmar que campos date-only (`due_date` em Lançamentos) continuam exibindo o dia correto — o ramo sem horário não foi alterado.

## Escopo

- Alterar apenas `src/lib/date-utils.ts` (função `parseFlexibleDate`).
- Nenhuma mudança de schema, RLS, edge function ou UI.
