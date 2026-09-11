# Reorganização do cabeçalho do card "Pendências do Sistema" no mobile

## Objetivo
Reduzir a altura do cabeçalho do card de pendências na versão mobile (screenshot: 407 px), mantendo todas as ações e informações atuais. Hoje o cabeçalho ocupa 4 linhas visuais; o ajuste deve deixá-lo com 3 linhas no mínimo, sem perder funcionalidade.

## Estado atual

```text
[Linha 1]  (sino) Pendências do Sistema  (badge 26)        [refresh] [settings] [Ver todas >]
[Linha 2]  Última atualização: 11/09, 01:24
[Linha 3]  [Atrasado: 20]  [Hoje: 0]  [Próximo: 6]
[Linha 4]  (quebra causada pelos botões de ação, conforme screenshot)
```

Problemas:
- A linha do título quebra no mobile porque "Pendências do Sistema" + badge + 3 botões não cabem.
- Os três chips de urgência são exibidos como pills soltos, o que pode quebrar em telas muito estreitas.
- A data de última atualização ocupa uma linha própria.

## Proposta

### Layout mobile alvo (3 linhas)

```text
[Linha 1]  (sino) Pendências do Sistema (badge)  [↻] [⚙] [Ver >]
[Linha 2]  [Atrasado 20 | Hoje 0 | Próximo 6]
[Linha 3]  Atualizado 11/09, 01:24
```

Para telas muito estreitas, a linha 1 continua em uma única linha porque o título trunca, as ações ficam em ícones compactos e "Ver todas" vira "Ver".

### Mudanças no componente

1. **Linha do título (mobile)**
   - Aplicar `flex-nowrap` com `truncate` no título, garantindo que não haja quebra.
   - Manter o badge ao lado do título.
   - Reduzir "Ver todas" para "Ver" no mobile (`sm:hidden`), mantendo o texto completo em telas maiores.
   - Manter refresh e settings como ícones (`size="icon"`).

2. **Chips de urgência (mobile)**
   - Transformar os três pills soltos em uma única barra segmentada (`inline-flex` com bordas arredondadas externas), ocupando uma linha só.
   - Cada segmento exibe ícone + contador + rótulo abreviado quando necessário (`Atrasado`, `Hoje`, `Próximo`).
   - Garantir que a barra não quebre em duas linhas; usar `shrink-0`, texto reduzido e `truncate` se precisar.

3. **Data de atualização**
   - Manter abaixo dos chips, mas com texto mais curto: "Atualizado 11/09, 01:24" (remover "Última atualização:").
   - Reduzir tamanho da fonte (`text-[11px]`).

4. **Desktop**
   - Preservar layout atual; as mudanças aplicam-se principalmente abaixo do breakpoint `sm`.

5. **Tokens de cor**
   - Aproveitar para substituir cores hardcoded (`bg-blue-50`, `text-amber-900`, etc.) nos chips por classes semânticas do tema (`bg-info/10 text-info`, `bg-warning/10 text-warning`, `bg-destructive/10 text-destructive`), caso existam; se não existirem, manter a aparência atual para não quebrar o visual.

## Escopo

- Apenas o componente `src/components/dp/home/PendenciasCard.tsx`.
- Não alterar lógica de dados, hooks, agrupamentos, ações de ignorar/adiar, nem o diálogo de detalhes.

## Testes e validação

1. Adicionar teste de renderização em `src/components/dp/home/PendenciasCard.test.tsx` que monte o card com dados stub e verifique:
   - presença do título "Pendências do Sistema";
   - presença dos três segmentos de urgência com os contadores corretos;
   - presença do botão/link "Ver todas" (desktop) / "Ver" (mobile).
2. Executar `bunx vitest run src/components/dp/home/PendenciasCard.test.tsx`.
3. Validar visualmente no preview em viewport mobile (407×748 ou similar) para confirmar que o cabeçalho não ultrapassa 3 linhas.
