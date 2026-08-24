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

### 2.1 Auditoria antes de alterar
Policies atuais de `dp_convocacoes`: `dp_convocacoes_admin_all` (ALL, admin/owner), `dp_convocacoes_read_self` (SELECT do próprio), `dp_convocacoes_respond_self` (UPDATE do próprio, `pendente` → `aceita`/`recusada`). Notado que `respond_self` restringe o status, mas **não restringe colunas** — o colaborador pode, no mesmo UPDATE, tocar termos materiais. Isso será reportado com evidência e tratado com proteção mínima (trigger de coluna imutável no caminho legado, permitindo só os campos da resposta), preservando o Portal atual.
`dp_convocacao_guard` **não será alterado preventivamente** — só se a auditoria mostrar necessidade concreta para a coexistência.

### 2.2 Migration de coexistência (RLS separada por comando)
Substituir a policy `FOR ALL` por policies específicas:

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
O `WITH CHECK` impede transformar linha legada em linha nova por UPDATE direto.

### 2.3 RPCs de planejamento e configuração
- Criar/editar **grupo** em rascunho — empresa derivada da unidade; `p_grupo_id` UUID estável do chamador.
- Criar/editar **ocorrência** em rascunho (necessidade, horário ofertado, vagas, condições comuns) — `p_ocorrencia_id` UUID estável; validações estruturais completas.
- **Revisão/versionamento** de ocorrência publicada — `p_sucessora_id` UUID estável; `FOR UPDATE` na predecessora, valida status, valida ausência de outra sucessora, marca `revisada`, cria sucessora e registra evento na mesma transação. Lock em ordem determinística **grupo → ocorrência**.
- **Configuração** por empresa/unidade — UPSERT idempotente sobre `UNIQUE (company_id, unidade_id)`, sob autorização; leitura sempre por `dp_convocacao_config_resolvida`.
- **Imutabilidade**: rascunho é editável; após publicação, termos materiais só mudam por revisão/versionamento.
- **Idempotência**: ID inexistente cria; mesmo ID com mesma entidade/contexto retorna o recurso existente sem novo evento; mesmo ID com payload/contexto incompatível retorna `IDEMPOTENCY_CONFLICT`. Os IDs nunca determinam `company_id`. Sem tabela genérica de idempotência.

### 2.4 Testes do bloco (transação revertida, sem resíduo)
- Legado intacto: criar, cancelar, excluir e responder direto continuam funcionando.
- Admin lê linha nova → permitido; colaborador lê a própria linha nova → permitido.
- Admin INSERT direto com `ocorrencia_id` preenchido → bloqueado; UPDATE de legado tentando definir `ocorrencia_id` → bloqueado; UPDATE/DELETE direto de linha nova → bloqueado.
- Colaborador responde linha legada → permitido; responde oferta nova → bloqueado; tentativa de alterar campos materiais na resposta legada → bloqueada.
- Retry de criação de grupo/ocorrência/revisão/configuração sem duplicar e sem evento extra; `IDEMPOTENCY_CONFLICT` no contexto incompatível.
- Multiempresa negativo pelas novas RPCs; grants/`EXECUTE` conferidos (PUBLIC e anon sem privilégio).

### 2.5 Entrega e parada
Relatório com migrations, SQL efetivo, policies antes/depois, RPCs, grants, testes de idempotência/multiempresa/legado, arquivos alterados, tipos regenerados, comparação com o baseline, rollback e confirmação de zero resíduos. Qualquer falha → PARO e diagnostico. Ao concluir, PARO e aguardo aprovação.

## 3. Blocos seguintes (não executar)
3B.2 publicação · 3B.3 resposta/vagas/Option A/trigger de escala · 3B.4 indisponibilidade/encerramentos/comparecimento · 3B.5 desistência/substituição/cancelamento/descumprimento.

## Notas técnicas
- Nenhum arquivo de frontend é alterado na 3B.1; `src/integrations/supabase/types.ts` é regenerado após as migrations.
- `dp_convocacoes_respond_self` e o trigger legado continuam existindo; remoção coordenada só no cutover da Fase 4.
