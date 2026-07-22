## Problema

No calendário de admin (`/dp/admin/calendario`), dias bloqueados por regras dinâmicas (ex.: 08/08/2026 pelo "Pós-Pagamento — FDS após dia 5") **aparecem como se estivessem disponíveis**.

## Diagnóstico

A engine de regras funciona: `DpAdminCalendario` carrega `dp_bloqueio_regras` + `dp_bloqueio_regra_unidades` da empresa selecionada e passa por `buildBloqueiosDeRegras` (com `vinculos: []` e `unidadeId: null`, aplicando as regras globalmente). `calculateDateStatus` retorna corretamente `status: "blocked"` para admin (`folga-rules.ts:264-267`).

O bug está apenas no **render** em `src/components/dp/FolgaCalendarShared.tsx` (grid "chunky", linhas 264-336):

1. **Sem etiqueta "Bloqueado" para admin.** O badge "Bloqueado" está atrás de `!isAdmin` (linha 307), então o admin só vê o ícone de cadeado — pequeno e discreto.
2. **Chip de ocupação verde sobrepõe o estado bloqueado.** Nos dias de FDS, o admin sempre vê `0/1` em verde (linhas 293-306) porque `occupancy < limit`, mesmo quando o dia está bloqueado por regra. A cor verde do chip domina visualmente e faz o dia parecer disponível, ainda que o fundo da célula esteja em vermelho tênue (`bg-destructive/10`).
3. **Mesmo problema no layout mobile** (linhas 193-215): admin só vê o chip verde `0/1`, sem "Bloqueado".

## Correção

Editar apenas `src/components/dp/FolgaCalendarShared.tsx` (frontend/apresentação):

1. **Grid desktop (chunky):**
   - Quando `c.status === "blocked"`, esconder o chip verde/amber `occupancy/limit` do admin e exibir uma etiqueta "Bloqueado" (mesmo estilo destrutivo já usado para colaborador) — vale para admin e colaborador.
   - Reforçar o fundo bloqueado subindo a opacidade (`bg-destructive/15 border-destructive/40`) para o estado ficar inequívoco.
   - Manter o ícone de cadeado no canto superior direito.

2. **Layout mobile:**
   - Se `c.status === "blocked"`, esconder o chip `occupancy/limit` do admin e mostrar a badge "Bloqueado" (que já existe, hoje só rendera para colaborador porque vem após `isAdmin && wknd`).

3. **Sem mudanças em SQL, RLS, engine de regras ou lógica de negócio** — o cálculo já está correto; corrigimos só a apresentação.

## Verificação

- Recarregar `/dp/admin/calendario` em agosto/2026 e confirmar 08 e 09 marcados como "Bloqueado" (fundo vermelho + label).
- Confirmar que dias FDS **não bloqueados** continuam mostrando `occupancy/limit` normal.
- Confirmar que o portal do colaborador segue idêntico (rota já validada).