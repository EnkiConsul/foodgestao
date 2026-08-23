# Convocações — Fase 1: Diagnóstico (nenhuma alteração feita)

Auditoria concluída sem alterar código, banco ou migrations. Abaixo o que existe hoje, o que serve, o que precisa mudar e a proposta técnica para a Fase 2.

## 1. Resumo executivo

O sistema tem hoje uma Convocação **simples**: uma linha = um colaborador + uma data + um horário, exclusiva de intermitentes, respondida no Portal por UPDATE direto na tabela. Não existe hierarquia de ocorrências, não existe vaga, não existe convocação aberta, não existe indisponibilidade e não existe fluxo de desistência/multa.

Em contrapartida, três peças pesadas do plano **já existem e devem ser reutilizadas**: o motor de cobertura por dia/cargo (`operacao-panorama.ts` + tela Operação), o motor de Trocas com aprovação/direta no backend (`dp_trocas` + `dp_processar_troca_direta` + `dp_config_resolvida`) e a necessidade mínima por cargo/dia/turno (`dp_cobertura_minima`, que já resolve o item 100 do plano).

Duas decisões precisam da sua aprovação antes da Fase 2: **onde gravar a indisponibilidade** e **se a Convocação atual evolui in-place ou passa a ter tabela-pai de ocorrências**.

## 2. Arquitetura atual (evidências)

Convocações
- `src/pages/dp/DpConvocacoes.tsx` (284 linhas): lista por intervalo de datas + diálogo de criação com colaborador único, data única, entrada/saída/intervalo, prazo digitado manualmente, cancelar e **excluir**.
- `src/hooks/useDpConvocacoes.tsx`: `criar` (insert direto), `cancelar` (update status), `remover` (**DELETE físico**), `useMinhasConvocacoes.responder` (update status direto do cliente).
- `src/lib/dp/convocacoes.ts`: status `pendente | aceita | recusada | cancelada | expirada`, `podeConvocar` (só `horasPorConvocacao` = intermitente), `validarConvocacao`, `snapshotDaConvocacao`, `statusEfetivo` (expiração calculada **só no frontend**).
- Tabela `dp_convocacoes`: `colaborador_id, unidade_id, turno_id, escala_item_id, data, entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, status, prazo_resposta, enviada_em, respondida_em, motivo_recusa, observacao, criada_por`. **0 registros hoje** (migração de dados não é risco).
- Trigger `dp_convocacao_guard`: **levanta exceção se o regime não for `intermitente`**; valida prazo no aceite.
- Trigger `dp_convocacao_sync_escala`: aceite cria/atualiza `dp_escala_itens` com `origem='convocacao'`; recusa/cancelamento/expiração apaga o item.
- RLS: `dp_convocacoes_admin_all` (admin/owner da empresa), `dp_convocacoes_read_self`, `dp_convocacoes_respond_self` (UPDATE só de `pendente` → `aceita/recusada`).

Cobertura / Operação
- `src/lib/dp/operacao-panorama.ts` (545 linhas): categorias `fixo, convocado_aceito, convocado_pendente, folga_padrao, folga_extra, ferias, atestado`, agrupamento por cargo, por período de funcionamento da unidade e aprendizado do padrão histórico por dia da semana.
- `src/pages/dp/DpOperacaoPanorama.tsx` (791 linhas): abas dia/mês, unidade pré-selecionada, cards reordenáveis.
- `dp_cobertura_minima`: `unidade_id, cargo_id, dia_semana, turno_id, minimo, vigencia_inicio/fim, ativo`.

Jornada
- `dp_colaborador_config_trabalho` (unidade, turno padrão, carga semanal, vigência) + `dp_colaborador_config_dias` (`dow, trabalha, turno_id, entrada, saida, intervalo_minutos`) — resolvidos por `src/lib/dp/config-trabalho.ts` (`turnoDoDia`). É daqui que sai a "jornada habitual".

Folgas / Calendário do Portal
- `dp_folgas`: `tipo (normal, extra, ferias, abono, licenca)`, `origem (fixa_semana, sorteio, troca, solicitacao, admin_manual, ferias, automatica_clt)`, `status`, `extra`.
- RLS `dp_folgas_self_insert` só aceita `origem='solicitacao' AND tipo='normal' AND extra=false`; `dp_folgas_validar_unificado` aplica teto/regras; `dp_datas_bloqueadas` bloqueia datas de folga.
- `src/pages/dp/portal/DpMeuCalendario.tsx` (935 linhas): calendário único do colaborador, hoje só folga/férias. **Nenhuma referência a indisponibilidade ou convocação.**

Trocas
- `dp_trocas`: `solicitante_id, destino_id, data_original, data_proposta, status (pendente_colega, pendente_gestor, aprovada, recusada, cancelada)`, respostas de colega e gestor. **Sem vínculo com convocação.**
- `dp_processar_troca` / `dp_processar_troca_direta` (SECURITY DEFINER, `FOR UPDATE`, valida autor e `troca_folga_modo`) e `dp_config_resolvida(company, unidade)`.
- Regras em `dp_config_dp`: `troca_folga_modo`, `troca_folga_escopo` — resolvidas em `src/lib/dp/dsr-rules.ts` (`troca permitida / exige aprovação`).

Regime
- Enum `dp_regime_trabalho` já contém `freelancer` (4 intermitentes, 0 freelancers cadastrados). `contrato-policy.ts` centraliza comportamento por regime, mas `horasPorConvocacao` é `true` apenas no intermitente.

## 3. Classificação requisito por requisito

JÁ EXISTE E DEVE SER REUTILIZADO
- Cobertura confirmada por dia/cargo, com "aguardando" separado de "confirmado" (`operacao-panorama.ts`, categorias `convocado_aceito` vs `convocado_pendente`).
- Detalhe do dia com pessoas, horário e origem (mesmo motor + tela Operação).
- Jornada habitual automática (`config-trabalho.ts`, `dp_colaborador_config_dias`).
- Snapshot de horário na convocação (colunas de horário/carga já existem + `snapshotDaConvocacao`).
- Vínculo do aceite com a escala (`dp_convocacao_sync_escala`) — não criar segunda fonte de verdade.
- Motor de troca com modo direto/aprovação no backend e regras por empresa/unidade (`dp_trocas`, RPCs, `dp_config_resolvida`, `dsr-rules.ts`).
- Calendário único do Portal, mobile, com bloqueios (`DpMeuCalendario.tsx`, `dp_datas_bloqueadas`).
- Necessidade por cargo/dia/turno (`dp_cobertura_minima`) → atende o item 100 sem tabela nova.
- Multiempresa: `private.is_company_admin_or_owner`, `dp_colaborador_ativo_of`, `is_company_member` já são o padrão.

EXISTE, MAS PRECISA SER ADAPTADO
- `dp_convocacoes`: precisa virar **ocorrência** de uma convocação-pai (mês) e ganhar vagas/ofertas.
- `dp_convocacao_guard`: precisa aceitar `freelancer` (via `contrato-policy`, não por comparação literal de regime).
- Aceite no Portal: hoje é UPDATE direto do cliente → precisa RPC atômica com trava de vaga, prazo e reelegibilidade.
- Prazo de resposta: hoje digitado à mão → derivar 1 dia útil no backend; expiração hoje é só visual → materializar "recusada por ausência de resposta".
- Exclusão de convocação publicada (`remover`) → substituir por cancelamento/arquivamento.
- `dp_trocas`: generalizar para substituição de ocorrência de convocação (referência à ocorrência + escopo intermitente/freelancer/fixo dominical).
- `DpConvocacoes.tsx`: passa a ter abas (Próximas/Aguardando/Confirmadas/Realizadas/Histórico/Regras) e o fluxo unidade → mês → cargos → calendário → dias → vagas → modalidade → jornada → revisar.
- `DpMeuCalendario.tsx`: mesmo calendário passa a permitir "Não estarei disponível" para intermitente/freelancer.
- `contrato-policy.ts`: novos predicados (`participaConvocacao`, `sujeitoMulta50`) para separar operação de regra jurídica.

NÃO EXISTE
- Convocação-pai mensal com ocorrências independentes.
- Vagas por cargo/data e preenchimento por ordem de aceite (com atomicidade).
- Convocação aberta, público elegível e ofertas por destinatário.
- Indisponibilidade do trabalhador.
- Timeline/eventos auditáveis da convocação.
- Aba Regras de Convocações (antecedência, matriz de trocas, presets, aprovação).
- Registro de exceção de antecedência (< 3 dias) por ocorrência.
- Desistência após aceite, análise de justo motivo, falta e referência de 50%.
- Snapshot financeiro da ocorrência.

EXISTE CONFLITO
- P0: `dp_convocacao_guard` **bloqueia freelancer** — qualquer convocação de freelancer falha hoje no banco.
- P0: `dp_convocacoes_respond_self` permite o trabalhador mudar status direto, sem checar vaga/concorrência → overbooking em convocação aberta.
- P1: `dp_folgas_self_insert` + `dp_folgas_validar_unificado` só admitem folga `normal/solicitacao` — gravar indisponibilidade em `dp_folgas` contaminaria DSR, teto de folgas, conformidade e relatórios CLT.
- P1: `remover` (DELETE) contraria "não excluir convocações enviadas".
- P2: `statusEfetivo` divergente do banco (expirada só no cliente).

PRECISA DE DECISÃO
1. **Indisponibilidade**: tabela própria `dp_indisponibilidades` (recomendado, isola DSR) ou novo `tipo/origem` em `dp_folgas`.
2. **Modelo da Convocação**: criar `dp_convocacoes_grupos` + tratar `dp_convocacoes` como ocorrência (recomendado, tabela está vazia) ou renomear/reconstruir.
3. **Ofertas**: tabela `dp_convocacao_ofertas` para convocação aberta (recomendado) ou reaproveitar ocorrência sem titular.
4. **Regras**: colunas novas em `dp_config_dp` (herda `dp_config_resolvida` e override por unidade) ou tabela dedicada.
5. **Multa/falta**: tabela de ocorrência de análise própria ou reuso de `dp_registros_disciplinares`.

## 4. Riscos

- P0: concorrência de aceite em vaga única; guard bloqueando freelancer; isolamento multiempresa nas novas RPCs (derivar `company_id` no backend).
- P1: regressão em Folgas/DSR ao introduzir indisponibilidade; regressão em Trocas ao generalizar; consistência do `dp_convocacao_sync_escala` quando houver substituição.
- P2: expiração materializada exigir job/lazy-update; volume do calendário mensal com muitos cargos.

## 5. Proposta técnica da Fase 2 (para aprovar depois)

- Modelo: `dp_convocacoes_grupos` (empresa, unidade, competência, modalidade individual/aberta, status) → `dp_convocacoes` como ocorrência (data, cargo, vagas, vagas_preenchidas, titular, snapshot de jornada e remuneração, marcação de antecedência) → `dp_convocacao_ofertas` (destinatário, status aguardando/aceita/recusada/sem_resposta/encerrada) → `dp_convocacao_eventos` (timeline) + `dp_indisponibilidades`.
- Backend: RPCs `dp_convocacao_publicar`, `dp_convocacao_aceitar` (atômica, `FOR UPDATE` na ocorrência, idempotente), `dp_convocacao_recusar`, `dp_convocacao_reabrir`, `dp_convocacao_substituir` (generalizando as RPCs de troca), `dp_indisponibilidade_marcar/remover`, `dp_convocacao_classificar_falta`.
- Frontend: wizard de Nova Convocação reaproveitando `operacao-panorama.ts` para a grade mensal por cargo; abas na tela Convocações; evolução de `DpMinhasConvocacoes` e `DpMeuCalendario`; aba Regras no padrão de Folgas.
- Máquina de estados explícita em `src/lib/dp/convocacoes.ts` (grupo, ocorrência, oferta), sem strings livres na UI.

Fase 1 encerrada. Nada foi alterado. Aguardo sua aprovação (e as 5 decisões acima) para apresentar a Fase 2 — arquitetura alvo detalhada, ainda sem código.
