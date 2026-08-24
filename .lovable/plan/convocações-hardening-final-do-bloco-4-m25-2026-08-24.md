# Convocações — Hardening final do Bloco 4 (M25)

Correções de segurança e consistência nos fluxos de folga, cobertura mínima e indisponibilidade. Sem novas telas e sem iniciar o Bloco 5.

## O que muda para o usuário

- Substituir uma folga pelo painel administrativo passa a ser uma operação única e segura: ou tudo acontece, ou nada muda. A folga antiga nunca é perdida quando o sistema pede confirmação de déficit.
- Histórico de folgas deixa de ser apagado; folgas trocadas ficam registradas como canceladas.
- A contagem de "equipe habitual" do dia passa a considerar só quem realmente trabalharia naquele dia (dia da semana, vigência, escala publicada, folga, férias, afastamento).
- O mínimo de cobertura passa a respeitar o turno da ação (ex.: almoço mínimo 3, noite mínimo 5).
- No portal, pedir folga que derrube a equipe abaixo do mínimo é bloqueado com mensagem clara: "Não é possível solicitar esta folga porque a equipe ficaria abaixo da cobertura mínima definida para este dia."
- Marcar indisponibilidade para hoje só é aceito se a operação do dia ainda não começou e as ofertas continuam realmente abertas; ofertas vencidas mantêm o encerramento correto no histórico.

## Backend (migration M25)

1. `dp_folga_criar_admin` reescrita (ou nova RPC dedicada) recebendo apenas intenção: `p_colaborador_id`, `p_data`, `p_tipo`, `p_extra`, `p_observacao`, `p_folgas_substituir uuid[]`, `p_confirmar_deficit`.
   - Autentica, deriva empresa da sessão/registros, valida owner/admin, revalida cada id de `p_folgas_substituir` (empresa, colaborador, data, status ativo).
   - `pg_advisory_xact_lock` com chave determinística por (company, colaborador, data).
   - Com `p_confirmar_deficit = false` e déficit: retorna `{ ok:false, requer_confirmacao:true, cobertura, mensagem }` sem qualquer efeito colateral.
   - Com confirmação: cancela logicamente (`status = 'cancelada'`) as folgas substituídas, cria a nova, registra override e auditoria — tudo na mesma transação, rollback total em qualquer falha. Nunca DELETE físico.
2. Capacidade habitual corrigida (nova versão de `dp_capacidade_habitual_dia_cargo`, callers migrados):
   - Reutiliza `dp_escala_itens` (autoritativa quando existir), `dp_colaborador_config_trabalho` / `dp_colaborador_config_dias` e `dp_turnos`; nenhum motor novo de jornada.
   - Exclui quem não trabalha no dia da semana, fora de vigência, não escalado, em folga, férias ou afastamento.
   - Convocáveis contam só com `compoe_equipe_habitual = true`; indisponibilidade reduz só com `considerar_indisponibilidade_cobertura = true`; convocação aceita não infla capacidade habitual.
   - Resolução determinística de `dp_cobertura_minima` por company/unidade/cargo/dia_semana/turno/vigência/ativo, com precedência: unidade+cargo+dia+turno → unidade+cargo+dia+genérico → combinações menos específicas. Retorno passa a expor `turno_id_aplicado`.
3. Nova RPC self-service `dp_folga_solicitar(p_data, p_motivo)`: resolve colaborador e empresa por `auth.uid()`, valida regime de folgas, data e regras existentes, recalcula cobertura, bloqueia com `COVERAGE_MINIMUM_VIOLATION` e só então insere em `dp_solicitacoes`. Sem cobertura mínima aplicável, comportamento atual preservado.
4. `dp_indisponibilidade_marcar` endurecida: dentro da transação, lock por trabalhador/data, materializa thresholds vencidos via `dp_convocacao_estado_encerramento` (`sem_resposta` / `encerrada_inicio_ocorrencia`) antes de qualquer cancelamento, retorna `ACCEPTED_CALL_REQUIRES_REPLACEMENT` para oferta aceita e `DAY_OPERATION_ALREADY_STARTED` quando o dia já começou. Só ofertas realmente abertas são canceladas como `INDISPONIBILIDADE_DECLARADA`.
5. Grants: RPCs de aplicação para `authenticated` e `service_role`; helpers internos sem `authenticated`; nenhum `PUBLIC`/`anon`. RLS existente preservada. Rollback documentado na própria migration.

## Frontend

- `src/pages/dp/DpAdminCalendario.tsx`: remover os `.from("dp_folgas").delete(...)` (linhas ~459 e ~565) e demais escritas diretas sensíveis; substituição e exclusão passam pela RPC, com fluxo de dois passos (diagnóstico → confirmação) preservando a UX atual.
- `src/pages/dp/portal/DpMeuCalendario.tsx`: substituir o INSERT direto em `dp_solicitacoes` (linha ~504) pela RPC `dp_folga_solicitar`, com mensagens amigáveis por código de erro.
- Tipos Supabase regenerados após a migration; sem `as any` permanente.

## Testes e validação

- Testes de substituição administrativa (primeira chamada sem efeito, confirmação atômica, falha mantém folga antiga ativa), capacidade por dia (10 cenários), turno (almoço 3 / noite 5), self-service (com e sem mínimo, bloqueio sem insert), indisponibilidade hoje (4 cenários + retry) e multiempresa A/B.
- Execução real de build, testes, lint e typecheck estrito, com números reportados.
- Concorrência real permanece não homologada se não houver ambiente isolado: `RELEASE BLOCKER — concorrência real não homologada` / `3B1_VALIDATION_ENVIRONMENT_UNAVAILABLE`.

## Fora do escopo

Substituição/desistência de convocação, reabertura de vaga, troca com fixo, regra dos 50%, descumprimento, comparecimento, no-show, Blocos 5 e 6.
