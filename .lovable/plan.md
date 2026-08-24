# Convocações — Fase 1: resumo final consolidado (nada implementado)

## 1. Decisões consolidadas

Aprovadas e incorporadas: `dp_convocacao_grupos` → `dp_convocacao_ocorrencias` → `dp_convocacoes` (oferta individual), sem `dp_convocacao_ofertas`, sem contador `vagas_preenchidas`; indisponibilidade em domínio próprio; "equipe habitual" na configuração de trabalho por unidade; regras de Folgas em `dp_config_dp` e configuração própria para Convocações; `dp_cobertura_minima` como única fonte de necessidade; folga de autoatendimento bloqueada quando derruba a cobertura e admin alertado com override auditado; indisponibilidade nunca negada e nunca cancelando folga concedida; descumprimento em domínio próprio, sem efeito financeiro automático; backend autoritativo em tudo que decide.

Corrigido nesta versão: a política de prazo. Passam a existir **dois relógios distintos** (prazo de referência e encerramento operacional), e nenhum "prazo de 2 horas" substitui o prazo de referência.

## 2. Invariantes que entram formalmente no modelo

1. **Substituição não gera dupla ocupação.** Efetivar substituição, na mesma transação: valida substituto → retira a ocupação do titular (estado terminal de "vaga cedida") → atribui a ocupação ao substituto → sincroniza escala (remove o item do titular, cria o do substituto) → grava histórico. A contagem de vagas considera **apenas estados de alocação ativa**, então uma substituição concluída mantém exatamente uma ocupação.
2. **Jornada da oferta é sempre snapshot individual.** A ocorrência define o modo (jornada habitual de cada trabalhador ou horário único da convocação) e cada linha de `dp_convocacoes` guarda o horário efetivamente apresentado àquela pessoa. Numa convocação aberta, pessoas com jornadas diferentes podem receber horários diferentes — a Fase 2 desenha o campo de modo e a resolução por trabalhador. Alterar a convocação nunca altera a jornada cadastral.
3. **Imutabilidade após publicação.** Com ofertas publicadas, data, cargo, unidade, entrada, saída e demais condições materiais não mudam silenciosamente: alteração material encerra/revisa a ocorrência preservando histórico e gera nova versão de oferta, com o trabalhador recebendo as novas condições. Nunca alterar retroativamente o que alguém já visualizou ou aceitou.

## 3. Prazo de referência x encerramento operacional (corrigido)

Dois campos/conceitos separados:

- **Prazo de resposta de referência**: 1 dia útil após a disponibilização, para intermitente e, por padronização operacional, também para freelancer. Não é reduzido por urgência. É o relógio usado para dizer "sem resposta após o prazo".
- **Encerramento operacional**: a oportunidade deixa de estar disponível no início da ocorrência, mesmo que o prazo de referência ainda esteja correndo.

Comportamento por cenário:

| Cenário | Prazo de referência | Disponibilidade prática |
|---|---|---|
| Antecedência ≥ 3 dias | 1 dia útil | Até o prazo |
| Emergencial (1–2 dias) | 1 dia útil (inalterado) | Até o início da ocorrência; alerta de fora da antecedência + exceção registrada |
| Mesmo dia | 1 dia útil (inalterado) | Até o início da ocorrência; alerta forte + exceção registrada; aceite antes do início confirma normalmente |

Nunca bloquear a publicação por antecedência curta. Distinguir sempre: **sem resposta após o prazo** ≠ **oportunidade encerrada porque a jornada começou**.

## 4. Estados (a nomear definitivamente na Fase 2)

`pendente`, `aceita`, `recusada`, `sem_resposta`, `encerrada_sem_vaga`, `encerrada_inicio_ocorrencia`, `cancelada`, `substituida`. Apenas `aceita` (e equivalentes de alocação ativa) ocupa vaga.

## 5. Evidências técnicas exigidas (coletadas agora, sem alterar nada)

`dp_colaborador_config_trabalho`
- PK: `dp_colaborador_config_trabalho_pkey (id)`.
- **UNIQUE parcial: `idx_dp_cct_vigente UNIQUE (colaborador_id) WHERE vigencia_fim IS NULL`** — hoje o colaborador só pode ter **uma** configuração em aberto. Ou seja: a tabela, como está, **não** suporta simultaneamente unidade A e unidade B com vigência aberta. Isso é um ponto de desenho obrigatório na Fase 2 (evoluir o índice para `(colaborador_id, unidade_id)` ou modelar o marcador de equipe habitual em estrutura filha por unidade). Nada foi alterado.
- Índices: `idx_dp_cct_company (company_id, colaborador_id)`, `idx_dp_cct_unidade (unidade_id)`, `idx_dp_colaborador_config_trabalho_turno_padrao_id`.
- FKs: `colaborador_id → dp_colaboradores (CASCADE)`, `company_id → companies (CASCADE)`, `unidade_id → dp_unidades (SET NULL)`, `turno_padrao_id → dp_turnos (RESTRICT)`.
- CHECKs: `dp_cct_dow`, `dp_cct_folga_coerente`, `dp_cct_periodo_valido`. Filha: `dp_colaborador_config_dias` com `dp_ccd_unico UNIQUE (config_id, dow)`.
- Dados: 12 linhas / 12 colaboradores — coerente com o índice de uma config aberta por pessoa.

`uq_dp_convocacoes_ativa`
- Definição real: `UNIQUE (colaborador_id, data) WHERE status IN ('pendente','aceita')`. Hoje, portanto, a **Opção A** está imposta pelo banco: no máximo uma oferta ativa por pessoa por dia.
- Consequência para o futuro: numa convocação aberta com dois turnos no mesmo dia, ou em duas ocorrências distintas sem conflito de horário, esse índice **impede** a segunda oferta. A Fase 2 precisa decidir a regra de produto (Opção A mantida, ou Opção B com unicidade por `(colaborador_id, ocorrencia_id)` + validação de conflito de horário no backend). Índice não alterado.

Outras evidências reconfirmadas no banco desta auditoria (`current_database() = postgres`): `dp_convocacoes` = 0 registros; `dp_escala_itens` com `origem='convocacao'` = 0 registros. Vantagem real: a mudança estrutural acontece antes da adoção da funcionalidade, sem migração de histórico — mas isso não autoriza apagar tabela ou índice sem análise dos consumidores (`useDpOperacaoPanorama`, `useDpHorarioPrevisto`, `useDpValeCalculadora`, `useDpPontoMes`, `useDpConvocacoes`, trigger `dp_convocacao_sync_escala`).

## 6. Cobertura, indisponibilidade e folgas (consolidado)

- Necessidade: só `dp_cobertura_minima` (unidade, cargo, dia da semana, turno, mínimo, vigência).
- Capacidade habitual = fixos previstos + intermitentes/freelancers marcados como equipe habitual **daquela unidade** e com dia/turno aplicável − folgas − férias − ausências − indisponibilidades (quando a regra da empresa estiver ativa).
- Confirmados (Convocações/Operação) = fixos previstos + convocações aceitas + substituições efetivadas. "Aguardando" sempre em linha separada. Compor cobertura nunca significa confirmado.
- Indisponibilidade: sempre registrável (nunca negada por déficit), nunca cancela folga concedida, sempre torna a pessoa inelegível para convocação naquela data, permitida em data bloqueada para folga, proibida em data passada.
- Déficit vira informação operacional ("Garçom 5/6 — falta 1") em Operação, na análise de Folgas e como vaga sugerida na criação da Convocação.
- Folga: Portal bloqueia quando existe mínimo configurado e a nova folga derruba a cobertura; admin recebe alerta com "Continuar mesmo assim" e override auditado (usuário, data/hora, cobertura esperada, cobertura resultante). Regra desativada → comportamento atual de Folgas intacto.

## 7. Backend autoritativo

Função SQL central para modalidades convocáveis (corrigindo o `dp_convocacao_guard`, que hoje compara `regime = 'intermitente'` e bloqueia freelancer); função de cobertura no banco como autoridade para bloquear/permitir folga; aceite, recusa, substituição, reabertura, publicação e classificação de descumprimento via RPC atômica com autorização e `company_id` derivado do vínculo; RLS e GRANTs no padrão do módulo; timeline append-only; sem DELETE de convocação publicada. Frontend apenas prévia de UX.

## 8. Riscos

- **P0**: guard bloqueando freelancer; aceite sem atomicidade (overbooking); dupla ocupação em substituição; `company_id` vindo do frontend; policy de UPDATE direto do Portal convivendo com vagas.
- **P1**: `idx_dp_cct_vigente` impedindo config por unidade; `uq_dp_convocacoes_ativa` impedindo múltiplas ofertas legítimas no mesmo dia; ligar cobertura à folga é comportamento novo (mitigar com mínimo cadastrado como gatilho, alerta no admin e regressão em Folgas/DSR); divergência ocorrência x snapshot da oferta sem regra de versionamento.
- **P2**: materializar `sem_resposta` e `encerrada_inicio_ocorrencia` (hoje a expiração é só visual em `statusEfetivo`); custo do calendário mensal com muitos cargos; calendário do Portal lendo duas fontes; duas telas de configuração (Folgas e Convocações).

## 9. Escopo da Fase 2 (a desenhar após sua aprovação)

Estados definitivos; horário por trabalhador x horário único; substituição sem dupla ocupação; imutabilidade/versionamento após publicação; tratamento de `idx_dp_cct_vigente`; tratamento de `uq_dp_convocacoes_ativa` (Opção A ou B); prazo de referência x encerramento operacional; encerramento das ofertas restantes ao preencher todas as vagas; regras de edição/cancelamento; configuração própria de Convocações; arquitetura dos RPCs; RLS.

PARADO. Nada foi alterado em código, banco, migrations, RLS ou frontend. Aguardo sua aprovação formal da Fase 1 para desenhar a Fase 2.
