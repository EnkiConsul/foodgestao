# Convocações — Fase 1 FINAL (diagnóstico e desenho; nada implementado)

## 1. Resumo das correções

Suas correções foram todas acatadas. As mudanças de rumo em relação à versão anterior:

- Convocações passam a ter **três níveis** (`dp_convocacao_grupos` → `dp_convocacao_ocorrencias` → `dp_convocacoes`), com `dp_convocacoes` mantida como **oferta/resposta individual** — não como ocorrência.
- `dp_convocacao_ofertas` é **descartada** por redundância (Modelo 1).
- "Compõe cobertura operacional" sai de `dp_colaboradores` e passa para a **configuração de trabalho por unidade** (Alternativa B).
- A regra autoritativa (regime que pode ser convocado, cobertura, aceite) fica **no banco**; o TypeScript é só prévia de UX.
- Indisponibilidade nunca é negada por déficit, nunca cancela folga já concedida, e o admin pode furar a cobertura com override auditado.
- Regras de Convocações **não** vão para `dp_config_dp`; só as regras de Folgas ficam lá.
- Descumprimento tem domínio próprio, sem lançamento financeiro automático.

Duas evidências novas coletadas nesta rodada:
- Confirmado no banco em uso nesta auditoria (`current_database() = postgres`, projeto do Lovable Cloud deste app): `dp_convocacoes` = **0 registros** e `dp_escala_itens` com `origem='convocacao'` = **0 registros**. Nenhum histórico a migrar.
- Existe hoje o índice `uq_dp_convocacoes_ativa` (parcial, único por `colaborador_id, data` enquanto ativa) — criado na migration `20260727183241`. Esse índice **já é** a trava natural de "uma oferta ativa por pessoa por dia", o que reforça o Modelo 1.
- Consumidores atuais de `dp_convocacoes` mapeados: `useDpOperacaoPanorama`, `useDpHorarioPrevisto`, `useDpValeCalculadora`, `useDpPontoMes`, `useDpConvocacoes` (+ duas migrations de contagem de uso de turno). Todos leem por colaborador/data — ou seja, todos continuam funcionando se `dp_convocacoes` permanecer individual.

## 2. Modelo final recomendado para Convocações

Modelo 1 (sua preferência), recomendado:

```text
dp_convocacao_grupos          ação do gestor
  empresa, unidade, competência, modalidade (individual|aberta),
  status, criada_por, publicada_em
        ↓ 1:N
dp_convocacao_ocorrencias     necessidade por data
  grupo, data, cargo, turno, vagas, snapshot de jornada,
  status, antecedência em dias, marcação de exceção
        ↓ 1:N
dp_convocacoes                oferta/resposta individual (tabela atual, evoluída)
  ocorrência, colaborador, status, prazo, disponibilizada/visualizada/
  respondida, motivo, snapshot de horário e remuneração, escala_item_id
```

Convocação individual = grupo + ocorrência com 1 vaga + 1 linha em `dp_convocacoes`. Convocação aberta = mesma ocorrência com N vagas + N linhas de oferta. Convocação mensal = várias ocorrências no mesmo grupo, cada uma evoluindo sozinha.

## 3. Papel de `dp_convocacoes`

Permanece o registro individual: um trabalhador, uma data, um horário, uma resposta, uma alocação. Ganha `ocorrencia_id` (e mantém `data`, `unidade_id` e `turno_id` como dados derivados da ocorrência para não quebrar os quatro hooks que já consultam por colaborador/data). Os status ganham `sem_resposta` e `encerrada_sem_vaga` além dos atuais (`pendente, aceita, recusada, cancelada, expirada`).

## 4. Necessidade ou não de `dp_convocacao_ofertas`

**Não criar.** Ela duplicaria exatamente o que `dp_convocacoes` já é (destinatário + status + prazo + timestamps de disponibilização/visualização/resposta + motivo). Modelo 2 (grupo → ocorrência → oferta → alocação) só se justificaria se uma mesma oferta pudesse gerar várias alocações ou se a alocação existisse sem oferta — nenhum dos dois acontece aqui. Modelo 1 tem menos tabelas, menos joins, menos risco e preserva os consumidores atuais.

## 5. Modelo de ocorrências e vagas

- A ocorrência carrega `vagas` (necessidade) e o snapshot de jornada padrão da data.
- A **verdade** sobre ocupação é `count(*)` das linhas de `dp_convocacoes` daquela ocorrência com status `aceita` (mais substituições efetivadas, que também são linhas aceitas).
- Se houver `vagas_preenchidas` como contador, ele é apenas cache: atualizado na mesma transação do aceite, com validação contra a contagem real; nenhuma decisão depende só dele. Preferência: começar **sem** contador e medir; se performance exigir, adicionar depois com constraint de coerência.
- Ocorrência sem titular único: correto — ela tem N alocados, e é por isso que a alocação vive em `dp_convocacoes`.

## 6. Aceite atômico

RPC única (SECURITY DEFINER, backend autoritativo):

```text
lock da ocorrência (SELECT ... FOR UPDATE)
  → confere que o usuário autenticado é o dono daquela oferta
  → confere status da oferta, prazo e status da ocorrência
  → revalida elegibilidade (ativo, unidade, cargo, indisponibilidade,
    férias, folga, conflito com outra convocação aceita)
  → conta aceites válidos da ocorrência
  → se aceites < vagas: marca a oferta como aceita
    senão: marca como encerrada_sem_vaga e retorna "vagas preenchidas"
  → sincroniza escala
  → grava evento na timeline
  (idempotente: reexecutar sobre oferta já aceita retorna o mesmo resultado)
```

Com 1 vaga e dois aceites simultâneos, o lock da ocorrência serializa: um aceita, o outro recebe "vagas preenchidas". Nunca 2 para 1.

## 7. Integração preservada com `dp_escala_itens`

Como o aceite continua sendo por linha individual de `dp_convocacoes`, a relação **1 aceite = 1 item de escala** se mantém e `dp_convocacao_sync_escala` continua válido na sua lógica atual. Duas adaptações: (a) o trigger passa a ser acionado dentro da RPC de aceite (ou permanece como trigger de UPDATE, que é o que já é hoje — nenhuma reescrita conceitual), e (b) na substituição, o item do titular anterior é removido e o do substituto criado na mesma transação. Escala, Operação, Horário Previsto, Ponto, VA/VT e folha continuam lendo a mesma fonte de sempre.

## 8. Indisponibilidade

- Tabela própria (`dp_indisponibilidades`): colaborador, data, unidade aplicável, motivo opcional, criado_por, timestamps; uma marcação por colaborador/data.
- **Nunca negada** por déficit de cobertura: registrar sempre e transformar o déficit em informação operacional.
- **Nunca cancela** folga já concedida: a folga anterior é preservada e o déficit aparece como necessidade de convocar.
- Data passada: não permitida. Data bloqueada para folga: permitida (não consome vaga de folga).
- Sempre torna a pessoa **inelegível** para receber/aceitar convocação naquela data, inclusive quando ela não compõe a equipe habitual.
- Convocação pendente na data: marcar indisponibilidade encerra a oferta e devolve a vaga. Convocação aceita: não permite marcar; oferece "Manter" ou "Solicitar substituição".

## 9. Cobertura habitual x Confirmados

Duas métricas separadas por definição, nunca somadas:

```text
CAPACIDADE HABITUAL (usada só na análise de Folgas)
  fixos previstos pela jornada/escala
+ intermitentes/freelancers marcados como equipe habitual daquela unidade
  E com dia/turno aplicável naquela data
- folgas concedidas, férias, ausências
- indisponibilidades (quando a regra da empresa estiver ativa)

CONFIRMADOS (calendário de Convocações e Operação)
  fixos efetivamente previstos
+ convocações aceitas (intermitente/freelancer)
+ substituições efetivadas
  → "aguardando" (ofertas sem aceite) aparece em linha separada, nunca somado
```

"Compõe cobertura = sim" nunca conta como confirmado. Só o aceite confirma.

## 10. Local recomendado da configuração individual

**Alternativa B**, como você preferiu: o marcador vive junto da configuração de trabalho por unidade (`dp_colaborador_config_trabalho`), que já tem `unidade_id`, `turno_padrao_id`, `carga_semanal_horas` e vigência (`vigencia_inicio/fim`) e já é 1 linha por colaborador hoje (12 linhas / 12 colaboradores auditados) — a estrutura suporta naturalmente uma linha por unidade quando a pessoa atuar em duas lojas. Assim João pode ser equipe habitual na Barra e reforço eventual no Centro, e o histórico respeita vigência.

Na UI, o campo aparece no cadastro do colaborador (aba Turno & Jornada, junto da unidade):

- "Considerar na equipe habitual desta unidade" — **ativado por padrão** para intermitente e freelancer.
- Apoio: "Ative quando a operação normalmente conta com esta pessoa para formar a equipe necessária. Desative quando ela for chamada apenas como reforço eventual."
- Não exposto para fixo (já integra a equipe prevista).

E, conforme seu item 6: entrar na capacidade de um dia exige **equipe habitual + unidade aplicável + dia/turno aplicável na configuração** — cadastrar 20 freelancers eventuais não infla a capacidade.

## 11. Regras de Folgas

Ficam em `dp_config_dp` (já resolvida empresa/unidade por `dp_config_resolvida`), duas regras apenas:

- "Considerar indisponibilidades de intermitentes/freelancers na cobertura para liberação de folgas" — **ativada por padrão**.
- "Quando a cobertura ficar insuficiente" — bloquear no autoatendimento (padrão) e alertar no lançamento do admin.

Comportamento:
- Autoatendimento (Portal), regra ativa e nova folga derrubando abaixo do mínimo → **bloquear**, com mensagem sem jargão: "Não há cobertura suficiente para liberar outra folga nesta data."
- Admin lançando manualmente → **alerta** "Esta folga deixará a equipe abaixo da cobertura configurada para este cargo/turno.", com "Voltar" ou "Continuar mesmo assim"; ao continuar, registra override auditado (usuário, data/hora, cobertura esperada, cobertura resultante, confirmação).
- Regra desativada → comportamento de Folgas idêntico ao de hoje; a indisponibilidade continua valendo para Convocações.
- Sem regra de mínimo cadastrada para aquele cargo/dia/turno → nada bloqueia (comportamento atual).

## 12. Comportamento quando indisponibilidade gera déficit

O déficit é informação, não punição:

```text
⚠ Cobertura abaixo do mínimo
Garçom — 5 / 6 — falta 1
```

Aparece em Operação, na análise de Folgas e, principalmente, como ponto de partida da criação de Convocações (a necessidade já vem pré-calculada nas vagas sugeridas). Folgas já concedidas permanecem; novas folgas passam pela regra da seção 11.

## 13. Integração com `dp_cobertura_minima`

Fonte única de necessidade, sem tabela nova e sem segundo conceito. Hoje ela é consultada por Escala e Operação (`escala-mes.ts`, `operacao-dia.ts`, `CoberturaMinimaCard`), mas **não** pela validação de folgas (`dp_folgas_validar_unificado` não a referencia) — é exatamente essa ponte que passa a existir. A resolução por unidade/cargo/dia/turno/vigência segue a lógica já testada em `cobertura-utils.ts` (regra sem turno vale para todos; a mais exigente prevalece).

## 14. Configurações de Convocações

Separadas de Folgas, como você pediu. Recomendação: **configuração própria de Convocações** (por empresa, com override por unidade no mesmo padrão de `dp_config_dp`), e não dezenas de colunas novas em `dp_config_dp`. Conteúdo: antecedência padrão (3 dias), política de prazo de resposta, matriz de substituição (intermitente↔intermitente, intermitente↔freelancer, freelancer↔intermitente, freelancer↔freelancer, fixo em folga dominical), modo de aprovação (sempre gestor / só exceções / automática), presets Controlado/Moderado/Autônomo, reabertura automática de vaga.

Ficam em `dp_config_dp` só as duas regras de Folgas da seção 11. A matriz de substituição de Convocações não substitui `troca_folga_modo`/`troca_folga_escopo`, que continuam governando troca de folga entre fixos.

## 15. Prazo normal e emergencial

Proposta de comportamento, para sua decisão:

| Cenário | Prazo de resposta |
|---|---|
| Antecedência ≥ 3 dias | 1 dia útil após a disponibilização, limitado ao início da ocorrência |
| Emergencial (1–2 dias) | Menor valor entre 1 dia útil e "início da ocorrência menos 2 horas" |
| Mesmo dia | Prazo curto fixo (ex.: 2 horas), sempre antes do início da ocorrência |
| Cálculo cairia depois do início | Truncar para o início da ocorriência menos uma margem mínima; se a margem não couber, a oferta nasce com prazo "até o início do turno" |

Regras invariantes: o prazo nunca é posterior ao início do trabalho; a convocação **nunca é bloqueada** por antecedência curta; o gestor confirma o alerta e a exceção fica registrada por ocorrência (dias de antecedência, usuário, timestamp da confirmação), derivada no backend e não pelo frontend. O gestor não digita prazo em condição normal.

## 16. Desistência/falta/justo motivo

Domínio próprio (`dp_convocacao_descumprimentos`), **sem** usar `dp_registros_disciplinares`. Representa: trabalhador, oferta/ocorrência, tipo (desistência após aceite | ausência no dia), motivo informado, análise (pendente | justificado | sem justo motivo), responsável, base de remuneração de referência (snapshot da oferta), percentual, valor de referência, prazo de até 30 dias, timestamps.

Regras: referência de 50% só para intermitente e só após classificação "sem justo motivo"; freelancer registra ocorrência e reabertura, sem multa; **nenhum lançamento financeiro, desconto, conta a receber ou rubrica de folha é criado automaticamente** — integração financeira é projeto separado. Antes da desistência, o Portal sempre oferece primeiro a tentativa de substituição.

## 17. Segurança e backend autoritativo

- Regime que pode ser convocado: função SQL central (ex.: `dp_regime_permite_convocacao(regime)`), usada pelo trigger `dp_convocacao_guard` e pelas RPCs. Hoje o guard compara literalmente `regime = 'intermitente'` e **bloqueia freelancer** — corrigir é P0. O TypeScript (`contrato-policy.ts`) espelha apenas para UX.
- Cobertura: função no banco é a autoridade para bloquear/permitir folga; o cálculo no frontend serve só para prévia e é sempre revalidado no servidor.
- Aceite, recusa, substituição, reabertura, publicação, classificação de descumprimento e alteração de regras: todos em RPC com autorização no backend; `company_id` derivado do vínculo do usuário, nunca aceito do frontend.
- Portal: substituir a policy de UPDATE direto por RPC (senão há overbooking).
- Multiempresa: RLS em todas as tabelas novas no padrão já usado (`is_company_admin_or_owner`, `is_company_member`, `dp_colaborador_ativo_of`) + GRANTs.
- Timeline append-only para auditoria; sem DELETE de convocação publicada (só cancelamento/arquivamento).

## 18. Riscos

- **P0**: guard bloqueando freelancer; aceite sem atomicidade (overbooking); `company_id` vindo do frontend em qualquer RPC nova; policy de resposta direta do Portal convivendo com vagas.
- **P1**: ligar cobertura à folga é comportamento novo — pode bloquear folga que hoje passa (mitigar: só age quando existe mínimo cadastrado, admin recebe alerta e não bloqueio, testes de regressão em Folgas/DSR); consistência do item de escala em substituição; divergência entre prévia no frontend e decisão do backend; contador `vagas_preenchidas` divergindo se for adotado.
- **P2**: materializar "sem resposta" (hoje a expiração é só visual em `statusEfetivo`); custo do calendário mensal com muitos cargos; calendário do Portal passando a ler duas fontes (folgas + indisponibilidades); dois lugares de configuração (Folgas e Convocações) exigindo UX clara.

## 19. Decisões finais que ainda precisam da sua aprovação

1. Modelo 1 confirmado: `dp_convocacao_grupos` → `dp_convocacao_ocorrencias` → `dp_convocacoes` individual, **sem** `dp_convocacao_ofertas`.
2. Ocupação apurada pela contagem de aceites, **sem** contador desnormalizado na primeira versão.
3. "Considerar na equipe habitual desta unidade" armazenado na configuração de trabalho por unidade (`dp_colaborador_config_trabalho`).
4. Regras de Folgas em `dp_config_dp`; regras de Convocações em configuração própria.
5. Política de prazo da seção 15 (inclusive prazo curto no mesmo dia e truncamento antes do início do turno).
6. `dp_convocacao_descumprimentos` como domínio próprio, sem efeito financeiro automático.
7. Bloquear no autoatendimento e alertar com override auditado no admin, quando a folga derrubar a cobertura.

PARADO. Nada foi alterado em código, banco, migrations, RLS, Portal, Folgas, Convocações ou Operação. Aguardo sua aprovação explícita da Fase 1 (e das 7 decisões acima) para então desenhar a Fase 2.
