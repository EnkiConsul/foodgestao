# Convocações — Bloco 4: Indisponibilidade, Encerramentos Automáticos e Cobertura/Folgas

Diagnóstico já realizado (nada será recriado à toa):

- `dp_indisponibilidades` já existe com `colaborador_id`, `data`, `motivo`, `origem`, `criado_por`, `cancelada_em`, `cancelada_por` e índice único parcial `(colaborador_id, data) WHERE cancelada_em IS NULL`. RLS ativa apenas com leitura (própria + admin) — nenhuma escrita aberta.
- `dp_regime_convocavel(regime)` já existe e será a única fonte de "quem pode".
- `dp_config_dp.considerar_indisponibilidade_cobertura` já existe.
- `dp_colaborador_config_trabalho.compoe_equipe_habitual` já existe (default true).
- `dp_cobertura_minima` já existe (company/unidade/cargo/dia_semana/turno_id, vigência, ativo) e será a única fonte de mínimo.
- `pg_cron` 1.6.4 instalado, sem job de convocações.
- `dp_convocacao_eventos` não tem constraint em `ator_papel` — "sistema" é aceito sem alteração de constraint.
- `dp_folgas_validar_unificado()` é trigger de validação de `dp_folgas`; portal e admin passam pela mesma trigger.

## Migrations (somente novas)

### M22 — Indisponibilidade self-service
- `dp_indisponibilidade_marcar(p_data date, p_motivo text default null)`: exige `auth.uid()`, resolve colaborador e company no backend, valida regime via `dp_regime_convocavel`, resolve timezone autoritativo (`dp_convocacao_timezone`), bloqueia data passada (`PAST_DATE_NOT_EDITABLE`), `pg_advisory_xact_lock` por colaborador/data, retorna jsonb com estado final.
- Histórico: sob o lock, linha ativa existente → retorno idempotente; se só houver linhas canceladas → INSERT de NOVA linha ativa (nunca reativar `cancelada_em`, nunca DELETE). O índice parcial existente garante no máximo uma ativa por colaborador+data.
- Oferta `aceita` (ou já realizada) na data → erro `ACCEPTED_CALL_REQUIRES_REPLACEMENT`, indisponibilidade NÃO é criada, aceite e escala intactos (substituição é Bloco 5).
- Ofertas `pendente` na data: TODAS as ofertas do novo fluxo (`status='pendente' AND ocorrencia_id IS NOT NULL`) daquele company+colaborador+data passam a `cancelada` com `encerrada_em=now()` e `encerramento_motivo='INDISPONIBILIDADE_DECLARADA'`, cada uma com evento determinístico `oferta_encerrada_indisponibilidade`. Nunca `recusada`. Nenhum estado já finalizado é alterado.
- `dp_indisponibilidade_remover(p_data date)`: mesmo esqueleto, cancelamento lógico (`cancelada_em`/`cancelada_por`), idempotente, sem DELETE físico, sem tocar em nenhuma oferta histórica.
- Auditoria `indisponibilidade_criada` / `indisponibilidade_removida` com payload mínimo.
- Grants: apenas `authenticated` e `service_role`; revogado de `PUBLIC`/`anon`. Escrita direta na tabela permanece fechada.


### M23 — Helper temporal + worker + cron
- `dp_convocacao_estado_encerramento(prazo, inicio, agora)` (IMMUTABLE/interno) com a regra exata da M21: prazo ≤ início → prazo precede; início < prazo → início precede; empate → `sem_resposta`; só um existente → usa o existente.
- Recriação de `dp_convocacao_responder_oferta` idêntica em comportamento, apenas delegando a decisão temporal ao helper (regra única no backend).
- `dp_convocacao_materializar_encerramentos(p_limit int default 500)`: SECURITY DEFINER, `search_path` fixo, sem acesso a `authenticated`/`anon`/`PUBLIC`; seleciona `status='pendente' AND ocorrencia_id IS NOT NULL` com threshold vencido usando `FOR UPDATE SKIP LOCKED`, revalida o status sob lock, atualiza só quando necessário (`pendente → sem_resposta` ou `pendente → encerrada_inicio_ocorrencia`), grava `encerrada_em`, `encerramento_motivo`, `updated_at`, e registra evento (`oferta_sem_resposta` / `oferta_encerrada_inicio`) uma única vez, com `ator_papel='sistema'` e `ator_user_id=NULL`. Nunca altera `aceita`, `recusada`, `encerrada_sem_vaga`. `expirada` não é usado.
- Job pg_cron `dp_convocacoes_encerramentos` a cada 5 minutos, criado de forma idempotente (unschedule por nome antes de schedule), chamando apenas a função interna.

### M24 — Capacidade habitual e cobertura nas Folgas
- `dp_capacidade_habitual_dia_cargo(...)`: helper interno multiempresa, fail closed, retornando `minimo`, `capacidade_habitual`, `indisponiveis_habituais`, `folgas`, `capacidade_apos_acao`, `deficit`. Capacidade habitual = fixos normalmente escalados + intermitentes/freelancers com `compoe_equipe_habitual = true`, menos folgas, férias e afastamentos; indisponibilidades só descontam quando `considerar_indisponibilidade_cobertura = true`. Convocações aceitas NÃO são somadas à capacidade habitual (Confirmados é outro conceito, usado só em Convocações/Operação) e oferta pendente nunca entra em Confirmados. Sem registro aplicável em `dp_cobertura_minima`, o comportamento atual das folgas é preservado.
- Folga self-service (portal): revalidação backend na mesma transação de criação; abaixo do mínimo → bloqueio, sem override possível pelo trabalhador ("Não é possível liberar esta folga porque a equipe ficaria abaixo da cobertura mínima definida para este dia.").
- Folga administrativa via RPC autoritativa (nenhum booleano de override confiado em INSERT/UPDATE comum): primeira chamada calcula a cobertura no backend e, havendo déficit sem confirmação válida, devolve o diagnóstico sem criar a folga; a segunda chamada autentica, deriva a empresa, exige owner/admin, revalida a cobertura na mesma transação, permite o override e registra auditoria (ator, empresa, unidade, cargo, data, mínimo, capacidade prevista, déficit, confirmação). Nada vindo do frontend (company_id, papel, mínimo, capacidade, déficit) é confiado.
- Indisponibilidade nunca é bloqueada por déficit; folgas já aprovadas nunca são canceladas ou alteradas.

## Frontend

- `src/pages/dp/portal/DpMeuCalendario.tsx` + `src/components/dp/FolgaCalendarShared.tsx`: reutilizar o calendário existente, adicionando estado "Indisponível" e legenda (Disponível / Indisponível / Convocação aguardando / Convocação confirmada). Mobile-first.
- Ações por toque em data futura: "Marcar como indisponível" (com aviso prévio quando houver oferta pendente: a oferta será encerrada) e "Remover indisponibilidade". Data com convocação confirmada mostra "Convocação confirmada" + orientação de substituição, sem ação de indisponibilidade.
- Novo hook `useDpIndisponibilidades` chamando as duas RPCs, invalidando calendário/convocações. Nenhum `company_id`/`colaborador_id` enviado pelo cliente.
- Portal Minhas Convocações: rótulos "Prazo encerrado" (`sem_resposta`) e "O período para responder terminou porque o trabalho já iniciou" (`encerrada_inicio_ocorrencia`), sem botões Aceitar/Recusar nesses estados.
- Abas de Convocações: "Aguardando" só com `pendente`; "Confirmadas" só com `aceita`; encerramentos preservados em Histórico.
- Operação/Panorama: auditar e corrigir onde ofertas pendentes ainda são somadas como pessoas trabalhando — pendentes passam a aparecer como "Aguardando", separadas dos confirmados. Sem redesign do módulo.
- UI de Folgas: bloco por cargo com "Mínimo: X / Equipe habitual disponível: Y" e aviso "Cobertura abaixo do mínimo" quando aplicável. Nenhum termo técnico exposto.
- Regenerar `src/integrations/supabase/types.ts` após as migrations; RPCs tipadas, sem `as any` permanente.

## Testes

- Indisponibilidade: intermitente e freelancer marcam data futura; regime não convocável rejeitado; data passada bloqueada; dupla marcação idempotente; remoção e remoção repetida idempotentes; ausência de DELETE físico; pendente encerrada atomicamente e não virando `recusada`; oferta aceita bloqueia marcação; remoção não reabre oferta; empresa A não afeta trabalhador B.
- Job: prazo antes do início; início antes do prazo; empate; só prazo; só início; nada vencido; `aceita`/`recusada`/`encerrada_sem_vaga` intactas; retry sem evento duplicado; limite de lote respeitado; concorrência sem sobrescrever resposta.
- Folgas/cobertura: regra ON reduz capacidade; OFF não reduz; `compoe_equipe_habitual=false` não conta; habitual disponível conta; pendente não é confirmado; aceita conta como confirmada; sem `dp_cobertura_minima` comportamento atual preservado; self-service abaixo do mínimo bloqueia; admin recebe alerta; override confirmado permite e audita; indisponibilidade pode gerar déficit sem bloqueio; folga aprovada não é cancelada.
- Espelho puro em TypeScript do helper temporal e da capacidade habitual, para testes unitários rápidos.

Bloco 5 (substituição/desistência/descumprimento) fora de escopo.
