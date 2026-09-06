# Férias 360° — rotina completa em 4 etapas

Objetivo: transformar Férias em rotina de gestão ponta a ponta (direito → planejamento → solicitação → aprovação → aviso ao colaborador → contabilidade → rotina da loja → retorno → histórico), **sem calcular nenhum valor de pagamento**.

O que já existe e será reaproveitado (auditado): períodos aquisitivos, agendamentos de férias, regras de limite simultâneo, períodos bloqueados, solicitações do colaborador, notificações do Pessoas, painel da operação e convocações. Nada é reconstruído do zero.

Decisões confirmadas: aviso de férias exige **60 dias** de antecedência, ajustável nas Regras de cada empresa; **qualquer perfil com acesso ao Pessoas** pode informar faltas (tudo auditado).

---

## Etapa 1 — Direito, faltas e alertas (base da rotina)

- Períodos aquisitivos passam a ser mantidos **automaticamente**, sem o gestor precisar escolher a pessoa e clicar em "gerar". O botão manual sai da tela.
- Ao fechar um período, o sistema pede: "Quantas faltas injustificadas computáveis para férias?" com o período em destaque e o texto de apoio ("ausências justificadas não devem ser incluídas"). Origem registrada como manual, pronta para vir do Ponto no futuro.
- O direito (30/24/18/12 dias) é definido no servidor pelas faixas legais de faltas; casos fora das faixas ficam marcados para revisão, sem inventar direito.
- Toda alteração de faltas guarda histórico: valor anterior, novo, quem, quando e motivo.
- Acompanhamento do prazo de concessão com três situações: **Normal**, **Atenção (30 dias)** e **Vencido**; a marcação antecipada de 90 dias fica como informação de planejamento.
- Nova tela principal de Férias em formato de painel: precisam ser programadas / vencem em 30 dias / aguardando aprovação / programadas / em férias hoje, e abaixo a lista de "Atenções" com botão **Programar**.
- Abas: Planejamento · Solicitações · Programadas · Em férias · Histórico · Regras.
- Regime respeitado pela política central: sócio e freelancer não recebem período aquisitivo CLT; intermitente segue a regra própria (Etapa 4).

## Etapa 2 — Solicitação do colaborador e aprovação com validações

- Portal ganha **Minhas Férias**: dias disponíveis, período aquisitivo, prazo de utilização e botão **Solicitar férias** (data pretendida, dias, abono, adiantamento do 13º quando liberado, observação). O colaborador nunca aprova as próprias férias.
- Aprovar/recusar/programar/cancelar passa a ser operação de servidor, com trava de concorrência, em uma única transação: valida gestor, empresa, pessoa, período, saldo, fracionamento, datas, feriados, repouso semanal, períodos bloqueados, limite de simultâneos, conflitos existentes; cria o agendamento, aprova a solicitação, registra auditoria e notifica.
- Início das férias é recusado quando cai nos dois dias que antecedem feriado ou repouso semanal, com explicação simples na tela.
- Antecedência do aviso: 60 dias por padrão, ajustável nas Regras; programar abaixo disso exige justificativa registrada, nunca passa silencioso.
- **Fim do apagar registro**: cancelamento vira status cancelado com quem, quando e motivo. Histórico completo na ficha do colaborador.
- Gestor pode programar direto, sem solicitação; a origem (colaborador, gestor, importação) fica registrada.
- Colaborador pode registrar **"Estou ciente das férias programadas"** no portal (ciência não é aprovação).
- Notificações sem duplicar: período disponível, 30 dias para vencer, solicitação recebida, aprovada, recusada, alterada, cancelada, férias próximas, início e retorno próximo.

## Etapa 3 — Feriados da unidade, 13º e contabilidade

- Nova aba **Feriados** no cadastro da Unidade, ao lado de Dados, Setores, Funcionamento e Sindicato. Cada unidade tem seu calendário; nunca cruza empresa ou unidade.
- Três tipos de feriado: data específica, data fixa anual (25/12) e data relativa estruturada (ex.: primeiro domingo de outubro; também último domingo do mês), com nome e liga/desliga.
- Visão "Feriados 2027" resolvida em lote, incluindo os gerados por regra relativa.
- Feriado e período bloqueado para férias continuam conceitos separados: um é regra legal, o outro é decisão operacional da empresa.
- Configuração do **adiantamento da 1ª parcela do 13º** com padrão da empresa e exceção por unidade: não oferecer / conforme regra legal / em qualquer época conforme política interna (com o aviso de que a contabilidade valida e processa). Quando indisponível, o campo simplesmente não aparece no portal.
- Fluxo para contabilidade: aprovada → a informar → informada, com ação **Informar à contabilidade** que gera o resumo (pessoa, CPF mascarado, unidade, período aquisitivo, datas, dias, abono, 13º, observação) e registra data e usuário. Sem nenhum valor, sem integração externa.

## Etapa 4 — Rotina da loja, impacto e cobertura

- Férias aprovadas aparecem na Rotina com o selo 🌴 e entram nos totais do dia (Habitual / Trabalhando / Férias / Folga). Solicitação pendente é previsão, não ausência.
- Passagem automática de programada → em gozo → concluída pela data, sem ação manual, com auditoria preservada.
- Aviso "João retorna das férias amanhã" e volta automática à rotina normal ao fim do período.
- Férias aprovadas **bloqueiam** marcar/solicitar folga na mesma data e tornam a pessoa inelegível para convocação ("Colaborador em férias").
- Ofertas de convocação pendentes que se sobrepõem às férias aprovadas são encerradas na mesma operação; convocação **já aceita** gera conflito e impede a aprovação até o gestor resolver.
- Intermitente: após o ciclo, o sistema controla o mês de férias do contrato — sem novas convocações, sem aceite, sem folga, exibido como "Período de férias do contrato intermitente".
- Análise de impacto ao programar: compara o previsto com o quadro habitual por unidade, cargo e setor efetivo do dia, e mostra "essas férias deixarão 8 dias com quadro abaixo do habitual" — recomendação, nunca bloqueio.
- Botão **Planejar cobertura** abre Nova Convocação pré-preenchida (unidade, cargo, setor, datas, quantidade e horários). Nada é convocado automaticamente: o gestor escolhe e publica.
- Calendário de férias mensal/anual com filtros de unidade, cargo e setor, mostrando sobreposições.

---

## Fora do escopo (regra absoluta)

Nenhum cálculo ou exibição de valor de férias, 1/3, 13º, INSS, FGTS, IRRF ou líquido; nenhuma provisão estimada; nenhum lançamento no financeiro. O cálculo é da contabilidade.

## Detalhes técnicos

- Banco: colunas de faltas no período (`faltas_injustificadas`, `faltas_informadas_em/por`, `faltas_confirmadas`, `origem_faltas`) + tabela de histórico; `dp_ferias_gozos` ganha `cancelado_em/por`, `motivo_cancelamento`, `origem`, `ciente_em/por`, estados de contabilidade (`contabilidade_status`, `informado_em/por`); nova `dp_ferias_solicitacao_detalhes` 1:1 com `dp_solicitacoes` (tipo `ferias`) — sem JSON solto; `dp_unidade_feriados` (tipo, nome, data, dia/mês, ordinal + dia da semana + mês, ativo) com `company_id` + `unidade_id`; antecedência do aviso e política do 13º em `dp_config_dp`/`dp_ferias_regras` com override por unidade. Toda tabela nova com GRANTs, RLS e políticas (colaborador só o próprio; gestor só empresas autorizadas).
- RPCs `SECURITY DEFINER` autoritativas e atômicas: `dp_ferias_manter_periodos` (idempotente, sem UI), `dp_ferias_informar_faltas`, `dp_ferias_solicitar` (portal), `dp_ferias_aprovar` / `dp_ferias_recusar` / `dp_ferias_programar` / `dp_ferias_cancelar` (com `FOR UPDATE` no período), `dp_ferias_registrar_ciencia`, `dp_ferias_marcar_informado`, `dp_feriados_resolver(unidade, inicio, fim)` em lote, `dp_ferias_impacto_periodo`, `dp_ferias_materializar_status`. Códigos de erro estáveis (`FERIAS_SALDO_INSUFICIENTE`, `FERIAS_INICIO_VESPERA`, `FERIAS_BLOQUEIO`, `FERIAS_SIMULTANEOS`, `FERIAS_CONVOCACAO_ACEITA`, `FERIAS_AVISO_ANTECEDENCIA`) traduzidos na UI.
- Integrações: `dp_convocacao_avaliar_candidato` passa a considerar `FERIAS_APROVADAS`; validações de folga (`dp_validar_solicitacao_folga`, criação admin) bloqueiam datas em férias; `operacao-panorama.ts` recebe a ausência de férias e o setor efetivo; enum `dp_notificacao_tipo` ganha os eventos de férias com chave idempotente.
- Frontend: `DpFeriasHub` reorganizado nas 6 abas, painel novo, `FeriasImpactoDialog`, `FeriasCalendario`, `UnidadeFeriadosPanel`, portal `DpMinhasFerias` + diálogo de solicitação; regras de regime só via `contrato-policy.ts`; helpers puros e testados em `src/lib/dp/ferias-*.ts` (faixas de faltas, feriados relativos, véspera, impacto).
- Testes: faixas 0/6/15/24 faltas, feriado relativo, véspera de feriado/DSR, simultaneidade no intervalo inteiro, concorrência de saldo, bloqueio de folga e convocação, idempotência das notificações; mais RLS multiempresa das tabelas novas.
