# Convocações — BLOCO 1: Tela completa + Rascunho + Regras

Diagnóstico rápido feito (só o necessário para o Bloco 1). Escopo integral mantido, sem MVP reduzido. Bloco 2 não será iniciado.

## Estado real verificado

- `src/pages/dp/DpConvocacoes.tsx` (284 linhas) é a tela **legada**: um único colaborador intermitente, uma data, sem abas, sem cargos, sem grupo/ocorrência. Escreve direto na tabela via `useDpConvocacoes` (132 linhas).
- Backend do novo fluxo **já existe e está aplicado**: `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacao_config`, `dp_convocacao_eventos`, `dp_convocacao_descumprimentos`, mais as RPCs `dp_convocacao_criar_grupo`, `atualizar_grupo`, `criar_ocorrencia`, `atualizar_ocorrencia`, `revisar_ocorrencia`, `salvar_config` e as helpers `dp_convocacao_config_resolvida`, `dp_regime_convocavel`, `dp_e_dia_util`, `dp_adicionar_dias_uteis`.
- `dp_convocacao_config` já tem todas as 12 regras da aba Regras (antecedência, prazo em dias úteis, aprovação, 4 matrizes de substituição, fixo em folga dominical, reabrir vaga, autonomia, oferta aberta, justificativa em exceção). Consentimento do substituto é sempre obrigatório e não terá toggle.
- `dp_cobertura_minima` já existe como fonte única de mínimo (consumida em leitura no calendário).
- `FolgaCalendarShared.tsx` (402 linhas) existe e será a base visual do calendário.

### P0 reais encontrados (resolvidos por 1 migration aditiva no Bloco 1)

1. `dp_convocacao_ocorrencias` **não tem `colaborador_alvo_id`** — sem isso a modalidade Individual não pode ser salva em rascunho.
2. `dp_colaboradores` tem `valor_hora` mas **não tem `valor_diaria`** — necessário para diagnosticar elegibilidade de Freelancer diarista já na etapa Revisar.

Nenhum outro P0. Implemento o Bloco 1 na sequência.

## O que o gestor verá funcionando ao fim do Bloco 1

Tela `/dp/convocacoes` reconstruída com abas **Próximas · Aguardando · Confirmadas · Realizadas · Histórico · Regras** (as abas de acompanhamento já leem dados reais; ficam vazias até a publicação existir, com estado vazio explicativo — nenhuma tela morta).

Wizard **Nova Convocação** na ordem aprovada, salvando rascunho de verdade a cada passo:

```text
Unidade → Mês/período → Cargos (multi) → Calendário mensal por cargo →
Datas → Vagas → Individual/Aberta → Público → Jornada → Revisar → [Publicar: Bloco 2]
```

- **Unidade**: unidades da empresa atual; backend rederiva company/membership/role — nada autoritativo sai do frontend.
- **Mês/período**: competência + intervalo opcional dentro dela. Grupo = ação mensal; cada data continua independente por ocorrência.
- **Cargos**: multi-select; cada cargo ganha seu próprio calendário mensal.
- **Calendário mensal por cargo** (base `FolgaCalendarShared`): seleção visual de datas; por data mostra `Garçom 3/6 · faltam 3` quando há cobertura mínima, ou `Garçom · 3 confirmados` quando não há; pendentes sempre em linha separada `+2 aguardando`. Pendente nunca soma como confirmado. Clique na data abre drawer com cargo, trabalhadores, regime, horário, origem, situação, vaga e confirmação.
- **Vagas** por data+cargo+necessidade. Ocupação é sempre calculada por aceites válidos — nenhum contador persistido.
- **Individual/Aberta**: Individual exige 1 alvo e trava vagas em 1; Aberta mantém alvo nulo e deixa o backend resolver elegíveis na publicação.
- **Público**: lista de elegíveis por leitura (mesma empresa, unidade, ativo, cargo, `dp_regime_convocavel`, jornada válida, compatibilidade integral, sem conflito na data). `compoe_equipe_habitual` não entra como critério. Compatibilidade só `integral | incompativel`.
- **Jornada**: "Usar jornada cadastrada" (`jornada_individual`) ou "Definir horário desta convocação" (`horario_unico`: entrada, saída, intervalo, vira dia), com carga prevista calculada.
- **Revisar**: resumo por cargo/data/vagas/modalidade/jornada, aviso de antecedência inferior a 3 dias corridos com confirmação (e justificativa quando a configuração exigir), e diagnóstico de remuneração ausente (Intermitente/Freelancer horista sem `valor_hora`; Freelancer diarista sem `valor_diaria`; Freelancer mensalista marcado como não elegível). Nada é convertido automaticamente a partir de salário mensal.
- Botão Publicar aparece desabilitado com a legenda "disponível no próximo bloco".

**Aba Regras**: formulário em linguagem simples, empresa + override opcional por unidade, salvando via `dp_convocacao_salvar_config` com controle otimista (`p_expected_updated_at`) e mensagem amigável em conflito. Consentimento do substituto exibido como obrigatório e não editável.

Rascunho é persistido nas tabelas reais: grupo em `rascunho`, ocorrências em `rascunho`, via as RPCs idempotentes existentes (ids gerados no cliente, `ON CONFLICT` no servidor) — retry não duplica nada.

## Detalhes técnicos

### Migration (M14 — aditiva, sem tocar migrations antigas)

- `dp_convocacao_ocorrencias.colaborador_alvo_id uuid NULL` + FK composta `(colaborador_alvo_id, company_id) → dp_colaboradores(id, company_id)` (índice único de suporte criado se ainda não existir).
- CHECK/trigger de coerência com a modalidade do grupo: grupo `individual` ⇒ alvo obrigatório e `vagas = 1`; grupo `aberta` ⇒ alvo `NULL`. Alvo imutável depois de publicada.
- Índice em `(company_id, colaborador_alvo_id, data)`.
- `dp_colaboradores.valor_diaria numeric NULL` (aditivo, sem default, sem backfill).
- `dp_convocacao_criar_ocorrencia` e `dp_convocacao_atualizar_ocorrencia` ganham o parâmetro `p_colaborador_alvo_id` ao final da assinatura, mantendo `SECURITY DEFINER`, `search_path` seguro, autorização antes de locks e grants restritos (`authenticated` + `service_role`, sem `anon`/`PUBLIC`). Substituição da função por `CREATE OR REPLACE`/drop da assinatura antiga na mesma migration para não deixar overload duplicado.
- Rollback: drop das colunas/índices/FK e restauração das assinaturas anteriores — documentado no corpo da migration.
- `src/integrations/supabase/types.ts` regenerado após aprovação.

### Frontend

- `src/pages/dp/DpConvocacoes.tsx` reescrita como shell de abas.
- Novos componentes em `src/components/dp/convocacoes/`: `NovaConvocacaoWizard.tsx`, `WizardUnidadePeriodo.tsx`, `WizardCargos.tsx`, `CargoCalendarioMes.tsx`, `OcorrenciaDrawer.tsx`, `WizardPublicoJornada.tsx`, `WizardRevisar.tsx`, `ConvocacoesRegrasPanel.tsx`, `ConvocacoesListaPanel.tsx`.
- Novos hooks: `useDpConvocacaoGrupos.tsx` (CRUD de rascunho pelas RPCs), `useDpConvocacaoConfig.tsx`, `useDpConvocacaoElegiveis.tsx`, `useDpConvocacaoCobertura.tsx`.
- Nova lógica pura em `src/lib/dp/convocacoes-planejamento.ts`: compatibilidade integral, Option A (uma oportunidade por pessoa/dia, ordem determinística `data → necessidade_entrada → necessidade_saida → cargo_id → id`), antecedência em dias corridos, prazo de resposta em dias úteis (seg–sex, sem feriados) separado do encerramento operacional, e diagnóstico de remuneração.
- `src/lib/dp/convocacoes.ts` e `useDpConvocacoes.tsx` preservados para o fluxo legado (`ocorrencia_id IS NULL`) — coexistência intacta até o cutover do Bloco 6.
- Mapa de erros → mensagem em português (`FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `CONCURRENT_MODIFICATION`, `PUBLICATION_*`, `OPTION_A_CONFLICT`, …). Nenhum termo técnico (RPC, RLS, trigger, worker, lease, service_role) na interface e nenhum erro SQL cru.
- Responsivo em desktop/tablet/mobile, com loading, sucesso, erro e confirmação em ações destrutivas.

### Testes

Unitários novos para `convocacoes-planejamento.ts` (compatibilidade, Option A, antecedência, dia útil, dois prazos, diagnóstico de remuneração) e testes de integridade da modalidade Individual/Aberta. Baseline comparado ao conhecido: build exit 0; 912 passed / 2 falhas pré-existentes de Pedidos / 46 skipped; lint 1414 problemas e 6 erros; typecheck strict 46 erros e 0 em Convocações.

## Pendências que permanecem

- **RELEASE BLOCKER mantido**: validação funcional de concorrência da M13 não executada (sem ambiente isolado com Auth real). A 3B.1 continua não declarada validada; isso não bloqueia o desenvolvimento.
- Blocos 2 a 6 (publicação, ofertas, Portal, aceite/recusa, indisponibilidade, encerramentos, substituição, descumprimento, comparecimento, histórico, cutover) fora deste bloco.

Ao terminar o Bloco 1 eu paro e apresento tela, fluxo, arquivos, migration, RPCs, testes, evidências de segurança, rollback e pendências.
