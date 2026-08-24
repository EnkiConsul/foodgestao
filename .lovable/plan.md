# Convocações — Fase 3B (arquitetura aprovada) · executar apenas o bloco 3B.1

## 0. Baseline técnico pré-3B (registro auditável)

Registrado de forma durável no repositório em `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md` (documento de evidência, sem efeito funcional) e também na memória do projeto:

- Build: `npm run build` exit 1 apenas pelo `prebuild` do security-lint — 229 críticos + 255 warnings pré-existentes, nenhum atribuído à 3A.1/3A.1.1; `npx vite build` exit 0.
- Testes: 98 arquivos (92 ok, 2 falhos, 4 skipped) · 960 testes (912 ok, 2 falhos, 46 skipped). Falhas pré-existentes: `orders-domain.test.ts`, `orders-entitlement.test.ts`. Nenhuma em DP/Convocações.
- Lint: 1414 problemas (6 erros + 1408 warnings). TypeScript strict: 46 erros, todos pré-existentes, nenhum em Convocações.
- Não corrigir esses débitos dentro de Convocações, salvo se a própria fase tocar o arquivo/regra.

Fases: 3A.0 ✅ · 3A.1 ✅ · 3A.1.1 ✅ · **3B por blocos (3B.1 autorizado)** · Fase 4 (frontend/cutover) depois.

## 1. Regras do adendo válidas para toda a 3B

- **Coexistência**: `ocorrencia_id IS NULL` = legado (DML direto continua); `ocorrencia_id IS NOT NULL` = fluxo novo, escrita só por RPC.
- **Prazo**: `disponibilizada_em` real, `prazo_resposta_base = disponibilizada_em + 1 dia útil`, `prazo_resposta = prazo_resposta_base` (guard legado lê `prazo_resposta`). Início da ocorrência é relógio separado e nunca encurta o prazo; decisão por comparação de timestamps (prazo primeiro → `sem_resposta`; início primeiro → `encerrada_inicio_ocorrencia`), validada em tempo real na RPC de resposta sob lock; cron só materializa.
- **Escala**: mecanismo único segue o trigger `dp_convocacao_sync_escala`, estendido cirurgicamente na 3B.3 para `desistida`/`substituida`/`cancelada` e preservando histórico em `encerrada_operacionalmente`. Sem flag de sessão, sem segundo mecanismo, sem função paralela nesta fase.
- **Publicação atômica** (3B.2): grupo + ocorrências + ofertas validados antes; erro estrutural aborta tudo; locks em ordem determinística.
- **Elegibilidade completa** no backend: empresa, unidade, vínculo, cargo aplicável, regime intermitente/freelancer, configuração de trabalho vigente, indisponibilidade na data, conflito com `dp_escala_itens`, conflito com convocação bloqueante, compatibilidade integral com a janela, horário, virada de dia, Option A. `compoe_equipe_habitual` não é critério. Compatibilidade só `integral`/`incompativel`.
- **Locks do aceite** (3B.3): oferta + ocorrência + trabalhador/data (lock de registro ou advisory transacional documentado), sem depender de `uq_dp_convocacoes_ativa`.
- **Vaga ≠ bloqueio de pessoa**: listas de estados distintas.
- **Preenchimento/reabertura**: última vaga → ocorrência `preenchida`, pendentes → `encerrada_sem_vaga` (nunca `recusada`); reabertura não ressuscita encerradas.
- **Substituição com consentimento**: original ocupa a vaga até o substituto aceitar; mesma transação marca original `substituida` e substituto `aceita`; recusa mantém original `aceita`; `aprovacao_modo = automatica` não elimina consentimento.
- **Descumprimento**: criado com `analise = pendente`; RPC administrativa separada classifica; só `sem_justo_motivo` + snapshot `intermitente` grava a referência de 50%; freelancer nunca.
- **Indisponibilidade**: só futura, global por colaborador/data, encerra pendentes do dia atomicamente, oferta aceita direciona para desistência/substituição, retirada restaura elegibilidade futura sem reabrir ofertas, `company_id` derivado.
- **Encerramento automático**: função interna idempotente + agendamento persistente, pelo primeiro threshold cronológico.
- **Comparecimento** separado do status (`compareceu`/`ausente`), sem novos valores no enum.
- **Coluna real** `origem_oferta` (`convocacao`/`substituicao`).
- **Remuneração**: diagnosticar a fonte real antes de `remuneracao_snapshot`; sem dados suficientes, PARAR o subfluxo e apresentar diagnóstico.
- **Segurança das funções**: `REVOKE EXECUTE` de **PUBLIC e anon**; `GRANT EXECUTE` a `authenticated` só nas RPCs efetivamente usadas pelo app; funções internas sem EXECUTE para PUBLIC/anon/authenticated; `auth.uid()`, validação admin/owner ou próprio colaborador, empresa derivada de entidade autoritativa (grupo pela unidade; config company-level valida vínculo/papel), `search_path` seguro, referências qualificadas, nada de status/timestamp/actor/company vindos do cliente, erros padronizados.
- **Eventos**: cada alteração efetiva gera exatamente um evento; retry sem transição não gera evento.

## 2. Bloco autorizado — 3B.1: coexistência segura + planejamento/configuração

### 2.1 Primeira ação auditável
Criar `.lovable/plan/convocacoes-fase-3b-baseline-e-execucao.md` com o baseline do item 0 e o registro de execução do bloco (documento de evidência, sem efeito na aplicação), incluído nas evidências finais.

### 2.2 Auditoria antes de alterar
Policies atuais de `dp_convocacoes`: `dp_convocacoes_admin_all` (ALL, admin/owner), `dp_convocacoes_read_self` (SELECT do próprio), `dp_convocacoes_respond_self` (UPDATE do próprio, `pendente` → `aceita`/`recusada`). Confirmado: `respond_self` restringe linha e status, **não restringe colunas** — o colaborador pode alterar termos materiais no mesmo UPDATE.
`dp_convocacao_guard` não será alterado preventivamente; só se a auditoria mostrar necessidade concreta para a coexistência.

### 2.3 Migration de coexistência (RLS separada por comando)
```text
admin_select        FOR SELECT  USING (admin_da_empresa)                              -- legado + novo
admin_insert_legacy FOR INSERT  WITH CHECK (admin_da_empresa AND ocorrencia_id IS NULL)
admin_update_legacy FOR UPDATE  USING (admin_da_empresa AND ocorrencia_id IS NULL)
                                WITH CHECK (admin_da_empresa AND ocorrencia_id IS NULL)
admin_delete_legacy FOR DELETE  USING (admin_da_empresa AND ocorrencia_id IS NULL)
respond_self        FOR UPDATE  USING (proprio AND ocorrencia_id IS NULL AND status = 'pendente')
                                WITH CHECK (proprio AND ocorrencia_id IS NULL AND status IN ('aceita','recusada'))
read_self           FOR SELECT  USING (proprio)                                       -- inclui ofertas novas
```
`WITH CHECK` impede transformar linha legada em linha nova por UPDATE direto.

### 2.4 Proteção de colunas no `respond_self` legado
Trigger `trg_00_dp_convocacao_legacy_self_columns` (nome com prefixo numérico porque o PostgreSQL executa triggers do mesmo evento em ordem alfabética — precisa rodar antes de `dp_convocacao_guard`, da sincronização de escala e do `updated_at`), avaliando o `NEW` original enviado pelo usuário:

- Atua **somente** quando `OLD.ocorrencia_id IS NULL` e o ator é o próprio colaborador e não é admin/owner.
- Permite apenas os campos de resposta do legado — confirmados no schema: `status`, `respondida_em`, `motivo_recusa`.
- Não restringe admin/owner além do comportamento atual e não interfere nas RPCs do fluxo novo.
- Testes obrigatórios: tentativa do colaborador de alterar junto da resposta `data`, `entrada`, `saida`, `carga_prevista_horas`, `prazo_resposta`, `colaborador_id`, `unidade_id`, `observacao` e `ocorrencia_id` — todas devem falhar.

### 2.5 RPCs de planejamento e configuração (criar ≠ editar)
Operações distintas: `criar_grupo`, `atualizar_grupo`, `criar_ocorrencia`, `atualizar_ocorrencia`, `revisar_ocorrencia`, `salvar_config` (nomes SQL na convenção `dp_convocacao_*` do projeto).

**Criação idempotente** (`p_grupo_id`, `p_ocorrencia_id`, `p_sucessora_id`): ID inexistente → cria + 1 evento; mesmo ID e mesmo conteúdo/contexto → retorna o existente sem evento; mesmo ID com conteúdo/contexto incompatível → `IDEMPOTENCY_CONFLICT`.

**Edição de rascunho** (payload diferente é edição legítima, nunca conflito de idempotência): `FOR UPDATE` na linha → valida `status = 'rascunho'` → se o conteúdo atual já é igual ao solicitado, sucesso no-op sem UPDATE e sem evento → senão, se `updated_at <> p_expected_updated_at`, `CONCURRENT_MODIFICATION` → senão, UPDATE + exatamente 1 evento. Sem tabela genérica de idempotência.

**Identidade estrutural imutável**: grupo — `id`, `company_id`, `unidade_id` (empresa derivada da unidade na criação; mudar de unidade exige novo grupo); editáveis em rascunho: `competencia`, `titulo`, `modalidade`, `observacao`. Ocorrência — `id`, `grupo_id`, `company_id`, `unidade_id`, `substitui_ocorrencia_id` imutáveis; editáveis em rascunho: cargo, data, janela da necessidade, turno de referência, `horario_modo`, horário ofertado, intervalo, carga, vagas e condições comuns, sempre revalidando constraints e contexto. Ocorrência publicada não usa `atualizar_ocorrencia`.

**Revisão/versionamento**: lock em ordem **grupo → ocorrência predecessora**; valida pertencimento ao grupo, status que permite revisão, ausência de sucessora, `p_sucessora_id` sem conflito e validade da nova versão; na mesma transação marca predecessora `revisada`, cria a sucessora e registra 1 evento. Retry após sucesso localiza a sucessora e devolve o mesmo resultado sem novo evento; predecessora revisada com sucessora não reconciliável → fail closed, sem segunda cadeia.

**Configuração**: UPSERT idempotente sobre `UNIQUE (company_id, unidade_id)`; unit-level deriva empresa da unidade; company-level valida admin/owner da empresa informada; leitura sempre por `dp_convocacao_config_resolvida`.

**Segurança**: `SECURITY DEFINER`, `search_path` seguro, `auth.uid()` obrigatório, referências qualificadas, `REVOKE EXECUTE FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated` só onde o app precisa; nunca aceitar `company_id`, ator, status ou timestamps autoritativos do frontend.

### 2.6 Vocabulário de eventos do bloco
Nomes padronizados e estáveis entre RPCs: `grupo_criado`, `grupo_atualizado`, `ocorrencia_criada`, `ocorrencia_atualizada`, `ocorrencia_revisada`, `config_criada`, `config_atualizada`. Sem enum novo. Alteração efetiva → 1 evento; retry/no-op → 0 eventos. Payload sanitizado.

### 2.7 Testes do bloco (transação revertida, sem resíduo)
- Legado intacto: criar, cancelar, excluir e responder direto continuam funcionando.
- Admin lê linha nova → permitido; colaborador lê a própria linha nova → permitido.
- Admin INSERT direto com `ocorrencia_id` preenchido → bloqueado; UPDATE de legado definindo `ocorrencia_id` → bloqueado; UPDATE/DELETE direto de linha nova → bloqueado.
- Colaborador responde linha legada → permitido; responde oferta nova → bloqueado; os 9 campos materiais listados em 2.4 → todos bloqueados.
- Criação: retry idêntico sem duplicar e sem evento novo; contexto incompatível → `IDEMPOTENCY_CONFLICT`.
- Concorrência de edição: A e B leem o mesmo `updated_at`; A atualiza com sucesso; B com o valor antigo → `CONCURRENT_MODIFICATION`.
- Retry de update: primeiro UPDATE altera e gera 1 evento; retry com o mesmo estado desejado → no-op, 0 eventos novos.
- Identidade: tentar alterar `company_id`, `unidade_id` do grupo, `grupo_id`/`unidade_id` da ocorrência pelas RPCs de edição → impossível por contrato ou rejeitado.
- Revisão: duas sucessoras para a mesma predecessora → exatamente uma; retry da mesma sucessora → mesmo resultado.
- Contagem de eventos antes/depois de todos os retries.
- Multiempresa negativo pelas novas RPCs; grants conferidos (PUBLIC e anon sem `EXECUTE`).

### 2.8 Entrega e parada
Relatório com migrations, SQL efetivo, funções/RPCs, policies antes/depois, grants, testes de coexistência/multiempresa/idempotência/concorrência/versionamento, eventos, arquivos alterados, tipos Supabase regenerados, baseline antes/depois, rollback e confirmação de zero dados artificiais. Qualquer falha → PARO e diagnostico. Ao concluir o 3B.1, PARO e aguardo aprovação.

## 3. Blocos seguintes (não executar)
3B.2 publicação · 3B.3 resposta/vagas/Option A/trigger de escala · 3B.4 indisponibilidade/encerramentos/comparecimento · 3B.5 desistência/substituição/cancelamento/descumprimento.

## Notas técnicas
- Nenhum arquivo de frontend é alterado na 3B.1; `src/integrations/supabase/types.ts` é regenerado após as migrations.
- `dp_convocacoes_respond_self` e o trigger legado continuam existindo; remoção coordenada só no cutover da Fase 4.
