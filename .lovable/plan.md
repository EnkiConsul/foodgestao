# Conformidade de descanso: duas leituras (CLT e regra da empresa)

## O que foi verificado

- Em setembro/2026 existe **um único** registro de folga na base: Rosângela, 05/09 (sábado).
- Cristiane, Hanna e Sara **não têm folga registrada** em setembro — nem no calendário de folgas, nem na escala do mês.
- O que aparece para elas é o **dia fixo de descanso do cadastro de trabalho** (Sara não trabalha terça, Cristiane não trabalha quarta). Esse dia não gera registro de folga e hoje não entra na conta da conformidade.
- A unidade Pakerê Garavelo usa a regra legal com domingo; a Pakerê T-63 usa acordo coletivo com sábado e domingo.

Resultado: a tela está correta na conta, mas engana o gestor, porque mistura duas coisas diferentes num único selo "Conforme / Fora".

## O que muda

A tela de Conformidade passa a mostrar **duas situações separadas** por colaborador:

1. **CLT (folga em domingo)** — a exigência legal: quantos domingos de folga a pessoa precisa ter no mês e quantos realmente tem.
2. **Regra da empresa** — a regra configurada da unidade: dias de descanso negociados, frequência definida e o dia fixo de descanso semanal do cadastro.

Cada colaborador ganha dois selos, e a coluna "Situação" passa a ser filtrável pelas duas leituras (só CLT em falta, só regra da empresa em falta, ambas, tudo em ordem).

O dia fixo de descanso semanal passa a ser considerado **na leitura da empresa** (é descanso de fato, previsto no cadastro), mas **nunca** na leitura CLT — ali só vale folga em domingo (ou dia negociado, quando a unidade tem acordo coletivo).

No detalhe do colaborador, dois blocos claros:

- "Exigência legal": domingos do mês, domingos folgados, mínimo esperado, origem da regra.
- "Regra da empresa": dias de descanso previstos, dia fixo do cadastro, folgas registradas com data e dia da semana, mínimo esperado.

E uma frase explícita quando for o caso: "Sem folga registrada em setembro — o dia de descanso semanal do cadastro (terça) não substitui a folga em domingo."

Os contadores do topo passam a mostrar as duas contagens em vez de uma só, e o CSV ganha as colunas das duas leituras.

## Detalhes técnicos

- `src/lib/dp/dsr-rules.ts`: `avaliarConformidade` passa a devolver `conformeClt` e `conformeEmpresa` (mantendo `conforme` como "ambas em ordem", para não quebrar outros consumidores), com `esperadoClt`/`folgasClt` e `esperadoEmpresa`/`folgasEmpresa` e rótulo de regra por leitura. O dia fixo do cadastro entra só na leitura da empresa.
- `src/pages/dp/DpConformidadeDsr.tsx`: busca também os dias de descanso semanais em `dp_colaborador_config_dias` via `dp_colaborador_config_trabalho`, duas colunas de selo, filtro de situação com as quatro opções, detalhe em dois blocos, contadores e CSV atualizados.
- Testes novos em `src/lib/dp/__tests__/dsr-rules.test.ts` cobrindo: dia fixo no meio da semana (empresa ok, CLT em falta), folga em domingo (ambas ok), unidade com acordo sábado/domingo, e nenhum descanso (ambas em falta).
- Sem mudança de banco.
- Rodar typecheck, lint e vitest, e conferir a tela no navegador.
