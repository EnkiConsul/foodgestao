## Problema

No `CalendarioMobileLista`, o número do dia usa `w-6` (24px), mas com `text-lg` + `font-bold` + `tabular-nums`, dígitos duplos como "22"/"28" chegam a ~24–26px e acabam encostando/estourando o box. Como o container é `flex items-baseline gap-1.5`, qualquer overflow desloca o conteúdo seguinte, dando a sensação de que os números "dançam" ao rolar.

## Correção (apenas em `src/components/dp/CalendarioMobileLista.tsx`)

1. **Aumentar a coluna do número do dia** para caber 2 dígitos em `text-lg tabular-nums` sem overflow:
   - `w-6` → `w-7` (28px), mantendo `text-right`.
2. **Aumentar o wrapper** de weekday+número para acomodar a nova largura sem espremer:
   - `w-16` (64px) → `w-[68px]` (10 + gap 1.5 + 7 = ~68px), `shrink-0`.
3. **Trocar `items-baseline` por `items-center`** no wrapper — baseline com pesos diferentes (weekday 11px semibold vs número 18px bold) contribui para a percepção de desalinhamento vertical.
4. Manter `tabular-nums` no número e no weekday (opcional) para largura de glifo estável.

Nenhuma alteração de lógica, dados ou outros calendários — apenas classes utilitárias do próprio componente compartilhado.

## Verificação

- Abrir `/dp/folgas`, `/dp/admin/calendario` e `/dp/portal/meu-calendario` no viewport mobile e conferir que a coluna de chips (nomes) começa exatamente na mesma coordenada X para os dias 1–9 e 10–31.
