# Convocações — BLOCO 1: Tela completa + Rascunho + Regras

Escopo integral, sem MVP reduzido. Bloco 2 não será iniciado. As 12 correções obrigatórias estão incorporadas abaixo.

## Estado real verificado

- `src/pages/dp/DpConvocacoes.tsx` (284 linhas) é a tela **legada**: um colaborador intermitente, uma data, sem abas/cargos/grupo — escreve direto na tabela via `useDpConvocacoes` (132 linhas).
- Backend do novo fluxo já aplicado: `dp_convocacao_grupos`, `dp_convocacao_ocorrencias`, `dp_convocacao_config`, `dp_convocacao_eventos`, `dp_convocacao_descumprimentos` + RPCs `criar_grupo`, `atualizar_grupo`, `criar_ocorrencia`, `atualizar_ocorrencia`, `revisar_ocorrencia`, `salvar_config` e helpers `dp_convocacao_config_resolvida`, `dp_regime_convocavel`, `dp_e_dia_util`, `dp_adicionar_dias_uteis`.
- `dp_convocacao_config` já contém as 12 regras da aba Regras. `dp_cobertura_minima` é a fonte única de mínimo. `FolgaCalendarShared.tsx` existe (402 linhas).
- Nenhum código do app chama hoje as RPCs novas — trocar a assinatura de `criar/atualizar_ocorrencia` não quebra chamador existente.

### P0 confirmados

1. `dp_convocacao_ocorrencias` não tem `colaborador_alvo_id` → Individual não é persistível.
2. `dp_colaboradores` tem `valor_hora`, `forma_pagamento`, `salario_base`, mas **não** `valor_diaria`.

## Migration M14 (aditiva, não altera M1–M13) — SQL já redigido

- `dp_convocacao_ocorrencias.colaborador_alvo_id uuid NULL`, FK composta `(colaborador_alvo_id, company_id) → dp_colaboradores(id, company_id)` (o índice único `uq_dp_colaboradores_id_company` já existe), índice parcial `(company_id, colaborador_alvo_id, data)`.
- Integridade Individual/Aberta por **trigger nos dois lados** (não CHECK cross-table): helper `dp_conv_ocor_valida_alvo(modalidade, alvo, vagas)` usado por
  - `trg_dp_conv_ocor_alvo_guard` (BEFORE INSERT/UPDATE de `grupo_id, company_id, colaborador_alvo_id, vagas, status`), e
  - `trg_dp_conv_grupo_modalidade_guard` (BEFORE UPDATE OF `modalidade` em `dp_convocacao_grupos`, revalidando todas as ocorrências do grupo).
  Impossível terminar com individual sem alvo, individual com vagas ≠ 1 ou aberta com alvo — inclusive ao trocar a modalidade do grupo.
- Imutabilidade: alvo não pode mudar quando a ocorrência não está mais em `rascunho`.
- `dp_colaboradores.valor_diaria numeric NULL` + CHECK `> 0 quando preenchido`. Sem backfill, sem conversão de `salario_base`, sem uso de `dp_cargo_salarios.salario_base`.
- `dp_convocacao_criar_ocorrencia` e `dp_convocacao_atualizar_ocorrencia` recriadas com `p_colaborador_alvo_id` no fim; as assinaturas antigas de 16 argumentos são dropadas explicitamente (sem overload residual), mantendo `SECURITY DEFINER`, `search_path` fixo, autorização antes de locks, reconciliação idempotente e grants apenas `authenticated` + `service_role` (`REVOKE FROM PUBLIC`). Helpers novos sem grant a `anon`/`PUBLIC`.
- Bloco de rollback documentado no corpo da migration. `src/integrations/supabase/types.ts` regenerado após aplicar.

## Persistência do wizard (correção 1)

Nada é gravado antes de ser estruturalmente válido. Sem modalidade fictícia, sem horário fictício, sem afrouxar schema.

```text
Unidade · Mês/período · Cargos · Datas   → estado local do wizard (nada no banco)
+ Modalidade definida (individual|aberta) → cria GRUPO rascunho (criar_grupo, id do cliente)
+ Ocorrência com cargo, data, necessidade_entrada/saida, vagas,
  horario_modo coerente (horario_unico ⇒ entrada/saida/intervalo/vira-dia/carga;
  jornada_individual ⇒ todos nulos) e alvo quando individual
                                          → cria OCORRÊNCIA rascunho (criar_ocorrencia)
depois disso                              → autosave idempotente (atualizar_*, com expected_updated_at)
```

Voltar etapas só dispara update quando o novo estado continua válido; enquanto inválido, a alteração fica em memória e o rascunho persistido permanece intacto. Sair e reentrar recarrega o rascunho real do banco.

## Tela definitiva

Abas **Próximas · Aguardando · Confirmadas · Realizadas · Histórico · Regras**. Sem termos técnicos (RPC, RLS, trigger, worker, lease, service_role) e sem erro SQL cru: mapa `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `NOT_DRAFT`, `CONCURRENT_MODIFICATION`, `IDEMPOTENCY_CONFLICT`, `OPTION_A_CONFLICT` → mensagem simples em português.

**Legado preservado (correção 5)**: as listagens leem o novo fluxo (`ocorrencia_id IS NOT NULL`, via grupo/ocorrência) **e** os registros legados (`ocorrencia_id IS NULL`), com selo discreto de origem. `useDpConvocacoes` e `src/lib/dp/convocacoes.ts` continuam existindo; o Portal legado (`DpMinhasConvocacoes`) não é tocado neste bloco.

Wizard **Nova Convocação**, ordem aprovada intacta:

```text
Unidade → Mês/período → Cargos (multi) → Calendário mensal por cargo →
Datas → Vagas → Individual/Aberta → Público → Jornada → Revisar → [Publicar desabilitado]
```

- **Unidade**: unidades da empresa atual; nada autoritativo sai do frontend — o backend rederiva empresa, vínculo e papel.
- **Mês/período**: competência `AAAA-MM` + intervalo opcional dentro dela. Grupo = ação mensal; cada data segue independente por ocorrência.
- **Calendário por cargo (correção 6)**: partes genéricas de `FolgaCalendarShared` extraídas para um calendário mensal reutilizável **sem** regras de Folga; a tela de Folgas mantém comportamento idêntico. Por data: `Garçom 3/6 · faltam 3` quando há cobertura mínima, ou `Garçom · 3 confirmados` quando não há; pendentes sempre em linha própria `+2 aguardando` — pendente nunca conta como confirmado. Clique abre drawer com cargo, trabalhadores, regime, horário, origem, situação, vaga e confirmação.
- **Vagas** por data+cargo+necessidade; ocupação sempre calculada por aceites válidos, sem contador persistido.
- **Individual/Aberta**: Individual pede o trabalhador e trava vagas em 1; Aberta mantém alvo nulo.
- **Público (correção 4)**: preview de elegíveis (mesma empresa/unidade/cargo, ativo, regime convocável, jornada válida, compatibilidade `integral|incompativel`, sem conflito na data; `compoe_equipe_habitual` fora do critério) e Option A com ordem determinística `data → necessidade_entrada → necessidade_saida → cargo_id → id`. Rotulado na UI como pré-análise; **não é autoridade de segurança** — o Bloco 2 revalida tudo no backend.
- **Jornada**: "Usar jornada cadastrada" (`jornada_individual`) ou "Definir horário desta convocação" (`horario_unico`), com carga prevista calculada.
- **Revisar**: resumo por cargo/data/vagas/modalidade/jornada; aviso de antecedência inferior a 3 dias corridos com confirmação (e justificativa quando a configuração exigir); diagnóstico de remuneração (Intermitente/Freelancer horista sem `valor_hora`; Freelancer diarista sem `valor_diaria`; Freelancer mensalista não elegível). **Publicar visível e desabilitado** com o texto "Publicação disponível na próxima etapa." (correção 9) — nada de publicação parcial.

## valor_diaria com caminho real de configuração (correção 3)

No cadastro/edição de colaborador, no mesmo painel onde hoje ficam `forma_pagamento` e `valor_hora` (`RemuneracaoFields.tsx`), o campo **"Valor da diária"** aparece quando regime = Freelancer e forma de pagamento = diarista, validado `> 0` quando preenchido. Sem backfill e sem conversão de salário.

## Aba Regras (correção 8)

`dp_convocacao_config` com padrão da empresa e override opcional por unidade, leitura por `dp_convocacao_config_resolvida`, gravação por `dp_convocacao_salvar_config` com `p_expected_updated_at`; em conflito, mensagem simples pedindo recarregar. Consentimento do substituto exibido como obrigatório, informativo, sem toggle.

## Arquivos

- Reescrito: `src/pages/dp/DpConvocacoes.tsx`.
- Novos em `src/components/dp/convocacoes/`: `NovaConvocacaoWizard.tsx`, `WizardUnidadePeriodo.tsx`, `WizardCargos.tsx`, `CargoCalendarioMes.tsx`, `OcorrenciaDrawer.tsx`, `WizardPublicoJornada.tsx`, `WizardRevisar.tsx`, `ConvocacoesRegrasPanel.tsx`, `ConvocacoesListaPanel.tsx`.
- Novos hooks: `useDpConvocacaoGrupos.tsx`, `useDpConvocacaoConfig.tsx`, `useDpConvocacaoElegiveis.tsx`, `useDpConvocacaoCobertura.tsx`.
- Nova lógica pura: `src/lib/dp/convocacoes-planejamento.ts` (+ testes) e mapa de erros.
- Ajustado: `RemuneracaoFields.tsx` (valor da diária), extração genérica do calendário a partir de `FolgaCalendarShared`.
- Preservados: `src/lib/dp/convocacoes.ts`, `useDpConvocacoes.tsx`, `DpMinhasConvocacoes.tsx`.

Responsivo em desktop/tablet/mobile, com loading, sucesso, erro compreensível, retry seguro e confirmação em ações destrutivas.

## Testes e relatório (correção 11)

Executarei e apresentarei **resultado realmente medido** (build, vitest, lint, typecheck), separado em três blocos: medido agora · baseline anterior conhecido · release blocker da M13. Nenhum número esperado será relatado como se tivesse sido executado.

## Pendências mantidas

- **RELEASE BLOCKER**: validação funcional de concorrência da M13 não executada (sem ambiente isolado com Auth real). A 3B.1 não é declarada validada; isso não bloqueia o desenvolvimento.
- Blocos 2 a 6 fora deste bloco.

Ao terminar o Bloco 1 eu paro e apresento tela construída, fluxo testado, migration, RPCs alteradas, arquivos, testes, build/lint/typecheck, segurança, rollback e pendências.
