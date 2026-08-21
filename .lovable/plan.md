# Benefícios: dias por jornada do colaborador (e convocações no intermitente)

## O que está acontecendo

Na tela de Benefícios, o Vale-Alimentação/Vale-Transporte de origem "cadastro" é calculado sem informar os dias da jornada: o hook chama o cálculo do VA sem os dias do colaborador, então cai no fallback de 22 dias para todo mundo. O VT usa o mesmo `dias_base` (ou 22). O motor de cálculo já sabe usar dias da jornada — só não está recebendo esse número nessa tela (na ficha do colaborador ele já recebe e mostra 25/26 dias corretamente).

## Correção proposta

1. **Dias pela jornada de cada colaborador**: a tela passa a contar, para o mês de referência, quantas vezes ocorrem os dias da semana marcados na configuração de trabalho vigente do colaborador (ex.: 6x1 em agosto = 26 dias; 5x2 = 22). Esse número alimenta o VA e o VT.
2. **Intermitentes**: para regime intermitente não existe jornada fixa, então os dias vêm da **quantidade de convocações aceitas** no mês de referência. Se ainda não houver convocação aceita no mês, mostra "aguardando convocações" com 0/valor a confirmar em vez de inventar 22 dias.
3. **Quantidade fixa continua respeitada**: quem tem VA marcado como "quantidade fixa" (acordo/CCT) segue usando o número cadastrado.
4. **Transparência na lista**: o detalhe de cada item mostra a origem dos dias — "26 dias (jornada seg–sáb)", "18 dias convocados" ou "22 dias (fixo)" — e um aviso quando a configuração de trabalho ainda não foi preenchida (usa 22 como referência provisória, sem travar).
5. **KPIs** (custo bruto/líquido, colaboradores atendidos) recalculam com os dias corretos.

## Detalhes técnicos

- `src/hooks/useDpBeneficiosCadastro.tsx`:
  - incluir `regime` nas colunas lidas de `dp_colaboradores`;
  - nova query em lote: configuração de trabalho vigente de todos os colaboradores da empresa (`dp_colaborador_config_trabalho` + `dp_colaborador_config_dias`, `vigencia_fim is null`), agrupada por `colaborador_id`;
  - nova query em lote: `dp_convocacoes` do mês de referência com `status = 'aceita'`, contando dias distintos por colaborador;
  - resolver `diasJornada` por colaborador: intermitente → dias convocados; demais → `diasTrabalhaveisNoMes(dias, competência)`; `null` quando não houver config (mantém fallback e sinaliza);
  - passar `{ diasJornada }` para `valeAlimentacaoDoMes` e usar o mesmo número no cálculo do VT;
  - expor no item `diasOrigem: "jornada" | "convocacao" | "fixo" | "padrao"` e um `detalhe` textual coerente.
- `src/pages/dp/DpBeneficios.tsx`: exibir o novo detalhe/aviso nos itens de origem "cadastro" (sem mudar layout já ajustado para mobile).
- Reaproveitar `diasTrabalhaveisNoMes` (`src/lib/dp/beneficios-regras.ts`); nenhuma regra nova de cálculo é criada.
- Testes unitários em `src/test/unit/dpHorarioBeneficios.test.ts`: 6x1 → 26 dias, 5x2 → 22, intermitente com 18 convocações aceitas → 18, sem config → fallback sinalizado.
- Sem mudanças de banco.
