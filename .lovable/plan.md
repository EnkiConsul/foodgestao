# Analytics — Pessoas 360° (Fase 1)

## Diagnóstico da tela atual

Auditei `src/pages/dp/DpAnalytics.tsx` (281 linhas), `src/hooks/useDpAnalytics.tsx` (300 linhas), o motor de padrão histórico da Rotina (`src/lib/dp/operacao-panorama.ts`), o resolvedor de setor da data (`src/lib/dp/setor-previsto.ts`) e o desenho real das tabelas de folgas, férias, solicitações, ocorrências, disciplinar, convocações, escalas, cobertura mínima e pessoas avulsas.

Hoje a tela lê 5 fontes (colaboradores, unidades, folgas, solicitações de atestado, lançamentos de folha) e oferece só o filtro de unidade + período em meses. Não usa Ponto — mas usa folha/custo, que sai de escopo.

### Inventário de indicadores

| Indicador | Fonte | Fórmula / regra | Histórico | Filtros | Status |
|---|---|---|---|---|---|
| Colaboradores ativos | `dp_colaboradores` | quadro na data final, por datas de admissão/desligamento | sim | un/cargo/setor/vínculo | PRONTO |
| Headcount mensal | idem | admissão ≤ data e (sem desligamento ou desligamento após a data) | sim | idem | PRECISA CORREÇÃO (regra da própria data de desligamento hoje é implícita) |
| Admissões / Desligamentos | idem | data dentro do período | sim | idem | PRONTO |
| Turnover do período | idem | ((adm+desl)/2) ÷ headcount médio × 100; médio = (início+fim)/2 | sim | idem | PRECISA CORREÇÃO (hoje o card mostra média dos meses com o nome "Turnover") |
| Taxa de desligamento | idem | desl ÷ headcount médio × 100 | sim | idem | PRONTO (novo) |
| Tempo de permanência | idem | desligamento − admissão; média, mediana, faixas | sim | idem | PRONTO (novo) |
| Desligamentos em até 90 dias | idem | contagem sobre desligados do período | sim | idem | PRONTO (novo) |
| Motivos de desligamento | enum `dp_motivo_desligamento` | quantidade, %, evolução | sim | un/cargo | PRECISA CORREÇÃO (NULL virava "outro"; passa a "Não informado") |
| Composição da equipe | unidade, cargo, vínculo, setor | contagem atual | snapshot atual | idem | PRONTO (novo) |
| Atestados / dias de afastamento | `dp_solicitacoes` tipo `atestado`, status `aprovada` | interseção de `data_alvo`–`data_fim` com o período | sim | un/cargo/setor | PRECISA CORREÇÃO (hoje filtra por `created_at` e conta o intervalo inteiro) |
| % de absenteísmo | — | — | — | — | REMOVER |
| Folgas | `dp_folgas` (status, origem, extra) | efetivas por período; origem `automatica_clt`/`auto_fechamento_periodo` = automáticas; `extra` = exceção de janela | sim | un/cargo/setor | PRONTO |
| Solicitações e tempo de decisão | `dp_solicitacoes.created_at` → `respondido_em` | contagem por tipo/status; mediana e média da decisão | sim | un/cargo | PRONTO |
| Ocorrências | `dp_ocorrencias` (`tipo`, `estado`, `data_operacional`, `unidade_id`, `setor_id`) | só `estado = confirmada` | sim | un/cargo/setor | PRONTO |
| Registros disciplinares | `dp_registros_disciplinares` (`tipo`, `data`) | bloco próprio, elogio/observação fora do disciplinar | sim | un/cargo | PRONTO com restrição de permissão |
| Férias | `dp_ferias_periodos` (`limite_concessivo`, `dias_saldo`, `status`), `dp_ferias_gozos` | saldo, vencendo em 30 dias, vencidos, programados, em gozo hoje | sim | un/cargo | PRONTO (novo) |
| Operação: quadro vs habitual | motor da Rotina (mediana por dia da semana, janela de 8 semanas, tolerância atual) | classificação abaixo/dentro/acima/histórico insuficiente | sim | un/cargo/setor | PRONTO (reuso) — precisa do mínimo de 3 amostras |
| Cobertura mínima | `dp_cobertura_minima` | bloco separado do habitual | sim | un/cargo/turno | PRONTO |
| Mão de obra extra | `dp_pessoas_avulsas` tipos `teste` e `folguista` | utilizações, dias, média por dia com uso, recorrência | sim | un/cargo/setor/dia da semana | PRONTO com correção (excluir `registro_manual`) |
| Convocações | `dp_convocacoes` (`status`, `data`, `enviada_em`, `respondida_em`) | aceite, recusa, sem resposta, tempo de resposta | sim | un/cargo | PRONTO |
| Custo de folha / financeiro | `dp_folha_*` | — | — | — | FORA DE ESCOPO — remover da tela |
| Dimensões históricas (unidade, cargo, vínculo) | não há snapshot no cadastro | — | — | — | SNAPSHOT ATUAL — rotular como "situação atual do cadastro"; para operação usar a informação da data (escala/config do dia) |

### Verificação P1 antes de reutilizar a operação

Primeira tarefa da implementação: conferir, no motor da Rotina, se férias aprovadas prevalecem sobre convocação aceita no mesmo dia. Se o resolvedor atual permitir convocação sobrepondo férias, isso é corrigido na Rotina antes de o Analytics consumir o resultado — o Analytics não replica a regra antiga.

## O que a Fase 1 entrega

Filtros globais no topo (Período 3/6/12/personalizado, Unidade, Cargo, Setor, Vínculo), empresa pelo contexto global já existente, carregamento por aba.

1. **Visão geral** — 8 indicadores (ativos, turnover do período, desligamentos, dias de afastamento, férias próximas do prazo, dias abaixo do habitual, aceite de convocações, uso de mão de obra extra), bloco "Situação da operação" (analisados / dentro / abaixo / acima, com "histórico insuficiente" exibido fora do denominador) e "Pontos de atenção" por regras fixas, sem IA e sem causalidade.
2. **Equipe** — headcount mensal, admissões, desligamentos, turnover mensal (série) x turnover do período (card), taxa de desligamento, tempo de permanência com faixas, desligamentos em até 90 dias, motivos e composição da equipe.
3. **Operação** — quadro do dia vs habitual por unidade, dia da semana, cargo e setor (quando aplicável), sempre em pessoas; cobertura mínima em bloco próprio; mão de obra extra e recorrência.
4. **Ausências e ocorrências** — atestados, folgas, solicitações, ocorrências confirmadas e registros disciplinares em blocos separados, nunca somados.
5. **Férias** — saldos, a programar, vencendo em 30 dias, vencidos, pessoas x períodos de gozo programados, em férias hoje, por mês e por unidade/cargo. Nenhum valor financeiro.
6. **Convocações** — enviadas, aceite, recusa, sem resposta, tempo de resposta, por cargo/unidade/mês.

Comparação com o período anterior de igual duração nos indicadores em que faz sentido (percentuais em pontos percentuais). Destaque negativo apenas em férias vencidas/prazo crítico, operação abaixo do habitual, limite excedido, conflito e erro. Setor desaparece por completo quando nenhuma unidade do contexto tem setor ativo, e a lista de setores segue a unidade escolhida.

## Detalhes técnicos

- Substituir `useDpAnalytics` por hooks por área em `src/hooks/dp/analytics/` (`useAnalyticsFiltros`, `useAnalyticsEquipe`, `useAnalyticsOperacao`, `useAnalyticsAusencias`, `useAnalyticsFerias`, `useAnalyticsConvocacoes`), cada um com `enabled` na aba ativa.
- Cálculo puro em `src/lib/dp/analytics/` (headcount, turnover, permanência, interseção de intervalos, agregações por dimensão), com testes unitários em `src/test/unit/` — incluindo o caso "atestado de 1 dia conta 1 dia" e a semântica inclusiva de `data_fim`.
- Agregações pesadas de operação e extras em RPCs `security definer` novas (`dp_analytics_operacao_dias`, `dp_analytics_extras`), resolvendo empresa no servidor e validando unidade × setor; nada de `company_id` vindo do cliente. As outras leituras seguem por PostgREST sob a RLS atual.
- Reuso de `baselinePorDow`/`avaliarDia`/`SEMANAS_BASELINE` com um mínimo de 3 amostras por dia da semana; abaixo disso o dia é "Histórico insuficiente".
- Setor da data pela precedência de `resolverSetorPrevisto`: escala publicada > configuração do dia > setor habitual.
- Escala publicada tem precedência; rascunho nunca entra na operação.
- Atestado tem fonte canônica única (`dp_solicitacoes`); `dp_ocorrencias` tipo `atestado` só entra na aba de ocorrências, sem soma nem dedução por heurística de nome+data.
- Mão de obra extra exclui `registro_manual` (é colaborador do quadro), evitando dupla contagem.
- Disciplinar: agregados só para papéis já autorizados hoje; sem permissão, o bloco não carrega (fail closed) e nunca há detalhe individual.
- Remoção dos cards de custo de folha e do percentual de absenteísmo.
- Sem ranking punitivo, sem inferência médica, sem horas.
