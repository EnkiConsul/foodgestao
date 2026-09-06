# Conformidade de descanso: contar as folgas aprovadas e separar CLT da regra da empresa

## Causa encontrada

As folgas que aparecem no calendário vêm dos **pedidos aprovados** (Sara 12/09, Hanna 19/09, Cristiane 20/09 — todas aprovadas em 05/09). A tela de Conformidade, porém, lê **outra fonte**: só as folgas já efetivadas (sorteio, lançamento manual do gestor, trocas). Como essas três folgas ainda não foram efetivadas, a conformidade conta zero folgas e marca as três como "Fora".

Confirmado também que o cancelamento funciona: a folga de 13/09 da Sara está cancelada e corretamente não é contada.

Além disso, os chips repetidos por dia da semana no calendário (Sara nas terças, Cristiane nas quartas, Hanna nas quintas) são o **dia fixo de descanso do cadastro de trabalho**, não folgas registradas.

## O que muda

**1. A conformidade passa a contar as folgas aprovadas**

Além das folgas efetivadas, entram na conta os pedidos de folga **aprovados** do mês (pedidos pendentes, recusados e cancelados continuam de fora). Com isso, Cristiane (20/09, domingo), Sara (12/09) e Hanna (19/09) passam a aparecer com folga no mês.

Cada folga no detalhe mostra a origem: "aprovada" ou "registrada".

**2. Duas situações separadas por colaborador**

- **CLT (folga em domingo)** — a exigência legal: quantos domingos de folga a pessoa precisa no mês e quantos tem. Só domingo conta (ou sábado/domingo, quando a unidade tem acordo coletivo com esses dias negociados).
- **Regra da empresa** — a regra configurada da unidade: dias de descanso negociados, frequência definida e o dia fixo de descanso semanal do cadastro.

Dois selos por linha e a coluna Situação passa a filtrar pelas quatro combinações (só CLT em falta, só regra da empresa em falta, ambas em falta, tudo em ordem). Os contadores do topo mostram as duas leituras e o CSV ganha as colunas das duas.

**3. Detalhe do colaborador em dois blocos**

- "Exigência legal": domingos do mês, domingos folgados, mínimo esperado, origem da regra.
- "Regra da empresa": dias de descanso previstos, dia fixo do cadastro, folgas do mês com data, dia da semana e origem, mínimo esperado.

Com uma frase explícita quando faltar: por exemplo "Folga em 12/09 (sábado) — não substitui a folga em domingo exigida pela CLT."

## Detalhes técnicos

- `src/pages/dp/DpConformidadeDsr.tsx`: a busca passa a somar `dp_folgas` (status ≠ cancelada) com `dp_solicitacoes` de tipo folga e status aprovada no intervalo do mês, deduplicando por colaborador+data; passa a ler também os dias de descanso semanais em `dp_colaborador_config_dias` via `dp_colaborador_config_trabalho`; dois selos, filtro de situação com quatro opções, detalhe em dois blocos, contadores e CSV atualizados.
- `src/lib/dp/dsr-rules.ts`: `avaliarConformidade` devolve `conformeClt` e `conformeEmpresa` (mantendo `conforme` como "ambas em ordem"), com esperado/realizado por leitura e rótulo da regra aplicada. O dia fixo do cadastro entra só na leitura da empresa.
- Testes novos em `src/lib/dp/__tests__/dsr-rules.test.ts`: folga aprovada em domingo (CLT ok), folga aprovada em sábado sem acordo (CLT em falta, empresa ok), unidade com acordo sábado/domingo, folga cancelada ignorada, dia fixo no meio da semana.
- Sem mudança de banco.
- Rodar typecheck, lint e vitest, e conferir a tela no navegador com setembro/2026.
