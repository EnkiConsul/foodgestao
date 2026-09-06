# Ocorrências — presença, atrasos, faltas, cobertura e tratativas de ponto

Nova área dentro de Rotina para registrar tudo que afeta a presença e o horário previsto do dia: faltas, previsões, atrasos, saídas antecipadas, atestados, coberturas por substituto e problemas de marcação de ponto. Ocorrências não altera ponto nem folha — apenas guarda o que aconteceu, a justificativa e a decisão do gestor, para uso posterior na conferência.

Entrega em 3 etapas.

## Etapa 1 — Registro e tela de Ocorrências

- Nova rota **Rotina → Ocorrências** (`/dp/ocorrencias`), com filtros de Hoje / Semana / Mês / Todas, e por colaborador, unidade, setor, tipo, status, impacto na assiduidade, impacto administrativo e tratativa de ponto. Abre por padrão no período recente com o que ainda precisa de ação.
- Cartões coloridos conforme a relevância: vermelho (afeta a operação agora), amarelo (atenção), verde (resolvido operacionalmente), neutro (administrativo).
- Tipos iniciais: falta, previsão de falta, atraso, previsão de atraso, atestado, ausência justificada, saída antecipada (prevista e realizada), esquecimento de marcação (entrada, saída, início e retorno do intervalo), atraso no retorno do intervalo, outra divergência de jornada. A estrutura aceita novos tipos sem refazer a tela.
- Cada ocorrência guarda: colaborador, data, unidade, setor efetivo do dia, horário previsto (vindo do horário previsto já existente), horário informado, horário real, duração calculada, justificativa inicial e final, quem registrou, quando informou, antecedência em relação ao início da jornada, status e vínculos.
- Ações rápidas do colaborador no portal, na jornada do dia: "Vou me atrasar", "Não poderei comparecer", "Preciso sair mais cedo", "Informar problema com ponto" — cada uma abre um passo a passo curto (quanto de atraso, qual marcação esqueceu, qual o horário correto, motivo). Prazo para registrar dias anteriores é configurável nas regras da empresa.
- Gestor pode criar e editar ocorrências manualmente pela mesma tela.
- Fluxo de virada: previsão de falta → falta confirmada ou cancelada; previsão de atraso → atraso confirmado com horário real, mantendo a justificativa inicial no histórico.
- Impacto na assiduidade e impacto administrativo nascem com o **padrão do tipo** (configurável nas regras) e o gestor pode alterar caso a caso; o sistema grava quem alterou e quando.
- Status: informada, aguardando análise, aguardando confirmação, confirmada, tratada, resolvida, cancelada; para ponto também pendente de tratamento e tratativa concluída.

## Etapa 2 — Rotina do dia, substituições e pendências

- Na Operação do dia, contadores no topo (equipe prevista, atrasos previstos, ausências, coberturas, saídas antecipadas) e selo na linha de cada pessoa com a ocorrência do dia. Ocorrências sem impacto operacional (ex.: esquecimento já ocorrido) não aparecem ali, ficam nas pendências.
- Comunicação atualiza a rotina na hora, sem depender de aprovação; o que aguarda análise é justificativa, impacto, substituto e tratativa.
- Substituição: ao informar ausência, o colaborador pode indicar quem cobre (colaborador cadastrado, pessoa avulsa/freelancer já cadastrada ou informar um novo). A exigência de aprovação é configurável por empresa em níveis: aprovação automática quando o substituto é colaborador cadastrado, automática quando é do mesmo cargo, ou sempre exigir aprovação do gestor. Cobertura aprovada mostra "ausência coberta" na rotina, com a linha do substituto abaixo da pessoa ausente — sem apagar o registro de que a pessoa escalada não trabalhou.
- Central de pendências do gestor com três blocos: Operação, Tratativas de ponto e Administrativo, cada item com a ação que falta ("definir impacto", "analisar justificativa", "aprovar substituição", "confirmar horário informado").
- Tratativa de ponto: gestor marca analisada, confirma a informação ou pede ajuste, com observação livre. Fica claro na tela que isso não altera ponto.

## Etapa 3 — Automático, histórico e indicadores

- Atestado cadastrado gera a ocorrência automaticamente, com vínculo ao documento e ao período; recusa ou exclusão do atestado cancela a ocorrência. Sem pedir registro em dobro.
- Aba **Ocorrências** no perfil do colaborador, agrupada por mês.
- Indicadores no painel: atrasos e tempo total de atraso no mês, atrasos no retorno do intervalo, faltas, ausências cobertas e sem cobertura, saídas antecipadas, esquecimentos e pendências em aberto.
- Histórico completo de alterações de cada ocorrência (quem mudou o quê e quando).

## Detalhes técnicos

Banco (migrações por etapa, sempre com GRANT + RLS por `company_id`):

- Enums `dp_ocorrencia_tipo`, `dp_ocorrencia_status`, `dp_ocorrencia_impacto` (`sim|nao|aguardando|nao_se_aplica`), `dp_ocorrencia_origem` (`colaborador|gestor|sistema`), `dp_ocorrencia_cobertura` (`nenhuma|proposta|aprovada|recusada`), `dp_ocorrencia_marcacao` (`entrada|saida|intervalo_inicio|intervalo_retorno`).
- `dp_ocorrencias`: company_id, colaborador_id, unidade_id, setor_id (setor efetivo via `dp_setor_previsto_id`), data, tipo, status, origem, previsto_entrada/saida, horario_previsto_ref, horario_informado, horario_real, minutos (gerado no backend), justificativa_inicial, justificativa_final, impacta_assiduidade, impacta_administrativo, relevancia_operacional, tratativa_ponto (bool), tratativa_status, tratativa_decisao, tratativa_observacao, marcacao_alvo, documento_id (FK `dp_documentos`), solicitacao_id, origem_ocorrencia_id (previsão → confirmada), informada_em, antecedencia_minutos, criado_por, analisado_por/em.
- `dp_ocorrencia_coberturas`: ocorrencia_id, substituto_colaborador_id, pessoa_avulsa_id, nome_livre, tipo_vinculo, entrada/saida, status, aprovado_por/em, motivo_recusa.
- `dp_ocorrencia_eventos`: trilha de auditoria (campo, de, para, autor, quando), preenchida por trigger.
- `dp_config_dp`: `ocorrencia_prazo_retroativo_dias`, `ocorrencia_cobertura_aprovacao` (`sempre|colaborador_cadastrado|mesmo_cargo`), e `dp_ocorrencia_tipo_config` (padrões de impacto/relevância/tratativa por tipo, por empresa, com seed).
- RPCs `SECURITY DEFINER`: `dp_ocorrencia_registrar` (valida prazo retroativo, calcula previsto e antecedência), `dp_ocorrencia_confirmar` (previsão → confirmada com horário real), `dp_ocorrencia_classificar` (impactos), `dp_ocorrencia_tratar` (tratativa de ponto), `dp_ocorrencia_cobertura_propor` / `dp_ocorrencia_cobertura_decidir` (aplica o nível de aprovação automática), `dp_ocorrencia_cancelar`, `dp_ocorrencias_listar(filtros)`, `dp_ocorrencias_pendencias(company)`, `dp_ocorrencias_do_dia(unidade, data)` para a Operação, `dp_ocorrencias_indicadores`. Trigger em `dp_documentos` (tipo `atestado`) cria/cancela a ocorrência de forma idempotente.

Frontend: `src/lib/dp/ocorrencias.ts` (rótulos, cores, cálculo de minutos e antecedência, textos de erro) com testes em `src/lib/dp/__tests__/`; hooks `useDpOcorrencias`, `useDpOcorrenciasDia`, `useDpOcorrenciasConfig`, `useMinhasOcorrencias`; páginas `src/pages/dp/DpOcorrencias.tsx` e componentes em `src/components/dp/ocorrencias/` (cartão, diálogos de registro/confirmação/classificação/tratativa/cobertura, painel de pendências); ações rápidas em `DpMeuHome.tsx`/`DpMeuEscala.tsx`; integração em `DpOperacaoPanorama.tsx` e `useDpOperacaoPanorama.tsx`; item "Ocorrências" no grupo Rotina de `src/config/dpNavigation.tsx` e rota em `src/App.tsx`.
