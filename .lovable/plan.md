# Analytics — Pessoas 360° (Fase 1)

## Diagnóstico da tela atual

Auditei `src/pages/dp/DpAnalytics.tsx` (281 linhas), `src/hooks/useDpAnalytics.tsx` (300 linhas) e o motor de padrão histórico da Rotina (`src/lib/dp/operacao-panorama.ts`), além do desenho real das tabelas de folgas, férias, solicitações, ocorrências, convocações, escalas e pessoas avulsas.

Hoje a tela consulta apenas 5 fontes (colaboradores, unidades, folgas, solicitações de atestado, folha) e mostra 1 filtro (unidade) + período em meses. Não usa nada de Ponto — bom ponto de partida.

### Resultado do diagnóstico

| Indicador | Fonte | Situação | Problema atual / correção |
|---|---|---|---|
| Colaboradores ativos | `dp_colaboradores.data_admissao/data_desligamento` | PRONTO | já usa datas, não `ativo` |
| Headcount mensal | idem | PRECISA CORREÇÃO | `ativoEm` exclui só `desligamento < ref`; a data de desligamento deve ser tratada de forma explícita e documentada |
| Admissões / Desligamentos | idem | PRONTO | manter |
| Turnover | (adm+desl)/2 ÷ média(início,fim) | PRONTO | fórmula correta; falta documentar e mostrar variação em p.p. |
| Taxa de desligamento | idem | PRONTO (novo) | desl ÷ headcount médio |
| Tempo de permanência / retenção 90 dias | datas de admissão e desligamento | PRONTO (novo) | ignorar quem não tem admissão |
| Motivos de desligamento | enum `dp_motivo_desligamento` | PRECISA CORREÇÃO | hoje NULL vira "outro"; deve virar "Não informado" |
| Composição do quadro | unidade, cargo, setor, regime | PRONTO (novo) | pessoas avulsas fora do headcount |
| Atestados (ocorrências, pessoas, dias) | `dp_solicitacoes` tipo `atestado` (+ `dp_ocorrencias` tipo `atestado`) | PRECISA CORREÇÃO | hoje filtra por `created_at` e conta o intervalo inteiro; passar a filtrar por `data_alvo`/`data_fim` e contar só a interseção com o período; considerar só status `aprovada` |
| % de absenteísmo | — | NÃO DISPONÍVEL | hoje é dias de atestado ÷ (ativos × dias corridos): conceitualmente errado. Remover e mostrar "Dias de afastamento" |
| Folgas | `dp_folgas` (status, origem, extra) | PRONTO | separar de ausências problemáticas; por dia da semana, origem, exceção de janela |
| Solicitações e tempo de decisão | `dp_solicitacoes.created_at` + `respondido_em` | PRONTO | há timestamp confiável de decisão |
| Férias (saldo, vencimento, em gozo) | `dp_ferias_periodos.limite_concessivo/dias_saldo`, `dp_ferias_gozos` | PRONTO (novo) | pessoas distintas e períodos de gozo como métricas separadas |
| Operação: quadro previsto vs habitual | mesmo motor da Rotina (mediana por dia da semana, 8 semanas, tolerância) | PRONTO (reuso) | reaproveitar `baselinePorDow`/`avaliarDia`; sem histórico → "Histórico insuficiente" |
| Cobertura mínima | `dp_cobertura_minima` | PRONTO | bloco separado do habitual |
| Mão de obra extra | `dp_pessoas_avulsas` (teste/folguista/registro manual) | PRONTO | utilizações, dias, por unidade/cargo/dia da semana; horas = saída − entrada |
| Convocações (aceite, resposta) | `dp_convocacoes.status/respondida_em` + destinatários | PRONTO | taxa de aceite por cargo/unidade/mês |
| Ocorrências administrativas | `dp_ocorrencias` (tipo/estado) e `dp_registros_disciplinares` | PRONTO com restrição | contar só `estado = confirmada`; disciplinar respeita a permissão atual — sem permissão, nada (fail closed) |
| Custo de folha | `dp_folha_lancamentos` | FORA DE ESCOPO | folha/ponto desativados; remover cards de custo |
| Setor histórico | `dp_escala_itens.setor_id` → config do dia → setor habitual | PRONTO (reuso) | não reclassificar histórico pelo cadastro atual |

## O que a Fase 1 entrega

Tela reorganizada em seis áreas, com filtros globais no topo (Período 3/6/12/personalizado, Unidade, Cargo, Setor, Vínculo) e carregamento por aba — nada de buscar tudo ao abrir.

1. **Visão geral** — até 8 indicadores (ativos, turnover, desligamentos, dias de afastamento, férias próximas do prazo, dias abaixo do habitual, aceite de convocações, uso de mão de obra extra), bloco "Situação da operação" (dias dentro/abaixo/acima do habitual) e "Pontos de atenção" por regras fixas, sem IA e sem causalidade.
2. **Equipe** — headcount mensal, admissões, desligamentos, turnover e taxa de desligamento, tempo de permanência, retenção até 90 dias, motivos, composição do quadro e ocorrências administrativas.
3. **Operação** — quadro previsto vs habitual por dia, por dia da semana, por cargo e (quando aplicável) por setor; cobertura mínima em bloco próprio; mão de obra extra e sua recorrência.
4. **Ausências** — atestados, folgas e solicitações em blocos separados; nunca somados.
5. **Férias** — saldos, a programar, vencendo em 30 dias, vencidos, programadas por mês, em férias hoje, distribuição por unidade/cargo; coincidência com dias abaixo do habitual descrita sem afirmar causa. Sem qualquer valor financeiro.
6. **Convocações** — enviadas, aceite, recusa, sem resposta, tempo de resposta, por cargo/unidade/mês.

Todo indicador relevante mostra comparação com o período anterior equivalente (percentuais em pontos percentuais). Cores negativas só onde a semântica é clara (prazo de férias vencido, abaixo do habitual, limite crítico). Setor desaparece por completo quando nenhuma unidade do contexto usa setores, e a lista de setores segue a unidade selecionada.

## Detalhes técnicos

- Substituir `useDpAnalytics` por hooks por área em `src/hooks/dp/analytics/` (`useAnalyticsFiltros`, `useAnalyticsEquipe`, `useAnalyticsOperacao`, `useAnalyticsAusencias`, `useAnalyticsFerias`, `useAnalyticsConvocacoes`), cada um com `enabled` na aba ativa.
- Cálculo puro em `src/lib/dp/analytics/` (headcount, turnover, permanência, interseção de intervalos, agregações), com testes unitários em `src/test/unit/`.
- Agregações pesadas de operação via RPCs `security definer` novas (`dp_analytics_operacao_dias`, `dp_analytics_extras`), resolvendo `company_id` pelo servidor e validando unidade × setor — nunca confiando no `company_id` do cliente. As demais leituras seguem por PostgREST com filtro de empresa e RLS existente.
- Reaproveitar `baselinePorDow`, `avaliarDia`, `SEMANAS_BASELINE` e a tolerância da Rotina; nenhuma metodologia paralela de "habitual".
- Setor efetivo da data pela precedência da Rotina: escala publicada > configuração do dia > setor habitual.
- Escala publicada tem precedência; rascunho não entra em indicador de operação confirmada.
- Remover da tela os cards de custo de folha (módulo desativado) e o percentual de absenteísmo.
- Ocorrências disciplinares: agregados só para papéis já autorizados; detalhe individual nunca via Analytics.
- Sem ranking punitivo por colaborador e sem inferência médica.
