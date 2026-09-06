# Setor efetivo por dia + impacto em folgas e trocas + padrão habitual

Hoje o setor existe apenas no cadastro do colaborador. A escala da data, a jornada por dia da semana e os fluxos de folga não guardam setor próprio, então a rotina mostra sempre o setor habitual.

Passam a existir quatro conceitos distintos: setor habitual (cadastro), setor recorrente do dia da semana (jornada), setor efetivo da data e exceção pontual de uma data.

## Setor continua opcional por unidade

A dimensão só liga quando a unidade tem pelo menos um setor **ativo**. Setores inativos ou apenas históricos não ligam nada. Unidade sem setores ativos segue idêntica a hoje: sem filtro, sem agrupamento, sem alerta, sem campo na jornada, sem ação de alterar setor e sem regra de folga por setor. Nenhuma migração de colaborador é exigida.

## Precedência do setor efetivo

```text
1. Setor da escala PUBLICADA daquela data
2. Setor da jornada para aquele dia da semana
3. Setor habitual do cadastro
   -> se nada resolver: SETOR_NAO_DEFINIDO
```

O primeiro valor existente vence. Rascunho de escala nunca entra: ele só aparece como prévia dentro da própria tela da escala e não afeta rotina, folgas, quotas, indicadores, trocas nem habitual.

**Não existe agrupamento "Sem setor".** Em unidade com setores ativos, quem está previsto para trabalhar e não resolve setor aparece como "Setor não definido", num indicador de pendência separado ("Setores não definidos: 2"), com a lista de pessoas e a ação "Definir setor". Não é erro bloqueante na rotina, é pendência visível.

Toda validação usa a **unidade efetiva da data** (onde a pessoa está escalada), não a unidade do cadastro. Empresa e unidade são sempre derivadas no backend.

## Turno e Jornada

Cada dia trabalhado ganha "Setor neste dia", com "Em branco, será usado o setor habitual do colaborador". Só aparece quando a unidade tem setores ativos e aceita apenas setores ativos da unidade correspondente.

## Alterar o setor de uma data

Na Rotina do Dia e no detalhe pessoa/data da Rotina do Mês: **Alterar setor deste dia**. O diálogo mostra colaborador, data, unidade efetiva, setor habitual, setor da jornada daquele dia, setor efetivo atual, origem, novo setor e motivo, com duas ações:

- **Usar setor padrão** — remove apenas a exceção da data; volta a valer jornada → habitual. Não toca turno, horário, tipo, carga, folga nem observações, e nunca apaga o item da escala.
- **Definir setor** — vale só para aquela data; não altera habitual, jornada, outras datas nem o histórico.

Ao lado, **Editar setor habitual do colaborador** abre o cadastro na seção certa e volta para a Rotina já atualizada. Os textos separam os conceitos: "Vale somente para esta data" x "Altera a área padrão do colaborador".

Leitura discreta: do cadastro mostra só o nome; da jornada mostra "rotina do dia"; da escala mostra "alterado hoje". O detalhe mostra habitual, jornada, efetivo e origem — ou "não definido".

Ajuste manual de setor **sobrevive à regeneração** da escala, à republicação e a edições não relacionadas.

## Visão da rotina

Seletor Cargo / Setor apenas quando há setores ativos. Na visão por setor: Unidade → Setor → Cargo → colaboradores, com confirmados, habitual, diferença e aguardando convocação. Clicar no setor abre confirmados, folgas, ausentes, aguardando, substituições e quem teve setor alterado no dia. Recalcula na hora quando o gestor muda um setor (um sai de Salão, entra em Cozinha), inclusive quotas e habitual, sem recarregar a página.

## Folgas

- Regras de limite aceitam Todos, Cargo, Setor, Grupo de setores e Colaboradores específicos. Grupo de setores = **cota única compartilhada** ("Salão + Bar, máximo 2" pode ser 2+0, 1+1 ou 0+2).
- A quota usa o **setor efetivo da data** (escala publicada → jornada → habitual), nunca só o cadastro atual — assim folgas antigas não são reclassificadas quando alguém muda de área.
- Várias regras podem alcançar a mesma pessoa/data; todas precisam ser satisfeitas, e basta uma saturada para bloquear nova solicitação.
- Setor não resolvido: regras gerais e por cargo continuam valendo; regras de setor não são presumidas e aparece "Setor precisa ser definido" com o texto explicativo.
- Alterar setor é sempre permitido e **nunca cancela folga válida**. Gerando excesso: "Cozinha ficará com 2 pessoas de folga neste dia. O limite configurado é 1.", com "Ver folgas do dia" e "Entendi". Excesso existente é preservado, mas novas solicitações ficam bloqueadas enquanto ocupação ≥ limite. Liberando vaga, informação discreta: "Uma vaga de folga foi liberada para o setor Cozinha nesta data."

## Trocas de folga

- Antes de confirmar, o sistema resolve o setor efetivo pós-troca de todos os envolvidos e mostra nome, data, unidade, setor habitual, setor antes, setor depois e origem.
- Mensagens: "Com esta troca, seu setor neste dia será alterado de Salão para Cozinha." ou "Seu setor permanece Salão."
- A troca nunca altera o setor habitual e não cria exceção sem necessidade: se jornada ou habitual já resolvem, usa esse resultado. Exceção de data só quando houver decisão explícita de cobrir outra área.
- Se alguém passar a trabalhar sem setor resolvido em unidade com setores, a troca exige a definição do setor antes de concluir.
- As quotas são recalculadas no estado pós-troca (quem sai de folga, quem entra), com aviso de excesso antes de concluir e a mesma filosofia: nada é cancelado automaticamente.
- A notificação final reflete o setor efetivo: "Sua troca de folga foi confirmada para 17/09. Neste dia, você trabalhará no setor Cozinha."

## Padrão habitual (não é cobertura mínima)

- O mecanismo atual é evoluído, não substituído: mediana das últimas 8 semanas, mesmo dia da semana, mesma unidade, tolerância de 20%. Passa a calcular também por cargo e por setor efetivo.
- Baseline por setor usa o setor efetivo **de cada data passada**; o passado nunca é reclassificado pelo cadastro atual.
- Confirmados = fixos previstos + convocações aceitas + substituições efetivas. Convocações pendentes ficam em "aguardando" e não entram.
- Mínimo de 3 observações válidas; abaixo disso, "Histórico insuficiente".
- Fórmula: `baseline = mediana`, `limiar = baseline × 0,80`; `confirmados < limiar` → "Abaixo do habitual". Sem arredondamento intermediário.
- Vocabulário restrito a "padrão habitual", "habitual", "abaixo do habitual", "histórico insuficiente". Nunca "mínimo" / "cobertura mínima" — cobertura mínima segue sendo outra coisa, parametrizada, e o habitual nunca bloqueia operação.

## Detalhes técnicos

Banco (migração única):
- `dp_escala_itens`: `setor_id uuid null` (FK `dp_setores`, ON DELETE RESTRICT) e `setor_motivo text null`. Preenchido = setor explícito da data; NULL = herdar.
- `dp_colaborador_config_dias`: `setor_id uuid null` (FK `dp_setores`, RESTRICT). NULL = usar habitual. Sem flag de "sem setor".
- Triggers de integridade nas duas tabelas: setor existente, da mesma empresa e da unidade efetiva do item/config, fail closed, `SETOR_UNIDADE_INVALIDA` / `SETOR_EMPRESA_INVALIDA` (traduzidos por `traduzirErroSetor`).
- `dp_setor_previsto(p_colaborador_id, p_data)` → `setor_id, setor_nome, origem ('escala'|'config_dia'|'cadastro'|'nenhum'), unidade_id, referencia_id, status ('ok'|'nao_definido')`; origem `escala` só a partir de escala publicada.
- `dp_setor_previsto_periodo(p_unidade_id, p_inicio, p_fim)` para resolver pessoa/data em lote no panorama mensal (sem N+1).
- `dp_escala_definir_setor_dia(p_colaborador_id, p_data, p_acao 'USAR_PADRAO'|'DEFINIR_SETOR', p_setor_id, p_motivo)`, SECURITY DEFINER: deriva empresa e unidade efetiva, valida papel, resolve o setor anterior, localiza ou materializa apenas o item necessário preservando turno/horário/tipo/carga/folga/observações, grava o setor, recalcula quotas, devolve impactos e audita.
- Auditoria: colaborador, data, unidade efetiva, setor e origem anteriores, novo setor, ação, usuário, timestamp, motivo; havendo impacto em folga, `regra_id`, limite, ocupação antes/depois e excedente.
- `dp_folga_limite_regra_setores(regra_id, company_id, setor_id, created_at)` + valor `setor` em `dp_folga_limite_regras.tipo`; RPCs de criação, solicitação, aprovação, troca e autoatribuição passam a usar o setor efetivo da data.
- Índices (só se não houver equivalente): `dp_escala_itens(setor_id)`, `dp_escala_itens(colaborador_id, data)`, `dp_colaborador_config_dias(setor_id)`, `dp_folga_limite_regra_setores(regra_id, setor_id)`. GRANTs e RLS no padrão do DP.

Frontend:
- `src/lib/dp/setor-previsto.ts`: mesma precedência em memória, com estado `nao_definido`.
- Cadeia da escala (`EscalaItemRow`, `EscalaItem`, `linhaParaItem`, `gerarEscalaMes`, preservação de ajustes manuais, INSERT da regeneração, `ajustarDia`, panorama) transportando `setor_id`.
- `operacao-panorama.ts`: setor efetivo por pessoa/dia, agrupamento Unidade → Setor → Cargo, pendência "Setor não definido", `baselinePorDow` por cargo e por setor com mínimo de amostras e limiar de 80%.
- `DpOperacaoPanorama` / `DpEscalaMes`: seletor de visão, ações "Alterar setor deste dia" e "Editar setor habitual", diálogo de alteração, avisos de folga e invalidação das consultas de rotina, folgas e panorama.
- `ColaboradorJornadaPanel`: campo "Setor neste dia" por dia trabalhado, oculto sem setores ativos.
- Trocas (`useDpTrocas` e telas de troca/portal): prévia de setor pós-troca, exigência de setor definido, avisos de quota e texto das notificações.
- Regras de folga: `FolgaRegrasFormDialog`/`FolgaRegrasPanel`, `useDpFolgaLimites`, `src/lib/dp/folga-limites.ts` com tipo `setor`, `setor_ids`, cota compartilhada e múltiplas regras.

Testes (bloqueantes):
- Gerar escala → trocar Sara de Salão para Cozinha em 17/09 → regenerar preservando ajustes → 17/09 continua Cozinha.
- "Usar setor padrão" não apaga o item nem altera turno/horário/tipo/carga/folga/observações.
- Precedência (escala publicada > jornada > habitual > não definido) e rascunho sem efeito em rotina/quota.
- Quota por setor efetivo, cota compartilhada de grupo, múltiplas regras, preservação de excesso e bloqueio de nova solicitação.
- Troca: setor pós-troca, exigência de setor definido, recálculo de quotas e texto da notificação.
- Baseline por cargo/setor com mediana, mínimo de 3 amostras e limiar 0,80; setor histórico não reclassificado.
- Regressão: unidade sem setores ativos sem nenhuma mudança de comportamento.
- RLS/tenancy: setor de outra empresa ou de outra unidade recusado no backend.

Rollback: remover `dp_folga_limite_regra_setores`, as novas funções e as colunas `setor_id`/`setor_motivo`; o setor do cadastro volta a ser a única fonte.

Observação: por estar em modo de plano, a tarefa ainda não foi registrada em `roadmap.md`; faço isso no início da execução.
