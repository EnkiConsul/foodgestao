# Convocações — Fase 3B (arquitetura aprovada com adendo) · executar apenas o bloco 3B.1

## 0. Registrar o baseline técnico pré-3B

Gravado em memória do projeto na aprovação (o modo de planejamento impede escrever agora), como referência para separar débito antigo de regressão:

- Build: `npm run build` exit 1 apenas pelo `prebuild` do security-lint — 229 críticos + 255 warnings pré-existentes, nenhum atribuído à 3A.1/3A.1.1; `npx vite build` exit 0.
- Testes: 98 arquivos (92 ok, 2 falhos, 4 skipped) · 960 testes (912 ok, 2 falhos, 46 skipped). Falhas pré-existentes: `orders-domain.test.ts`, `orders-entitlement.test.ts`. Nenhuma em DP/Convocações.
- Lint: 1414 problemas (6 erros + 1408 warnings). TypeScript strict: 46 erros, todos pré-existentes, nenhum em Convocações.
- Não corrigir esses débitos dentro de Convocações, salvo se a própria fase tocar o arquivo/regra.

Fases: 3A.0 ✅ · 3A.1 ✅ · 3A.1.1 ✅ · **3B em execução por blocos** · Fase 4 (frontend/cutover) depois.

## 1. Adendo incorporado (vale para todos os blocos)

- **Coexistência**: `ocorrencia_id IS NULL` = legado (DML direto continua permitido); `ocorrencia_id IS NOT NULL` = fluxo novo, escrita exclusivamente por RPC.
- **Prazo**: na publicação, `disponibilizada_em` real, `prazo_resposta_base = disponibilizada_em + 1 dia útil` e `prazo_resposta = prazo_resposta_base` (o guard legado ainda lê `prazo_resposta`). O início da ocorrência é relógio separado; nunca encurta o prazo. Decisão sempre por comparação de timestamps: prazo primeiro → `sem_resposta`; início primeiro → `encerrada_inicio_ocorrencia`. RPC de resposta valida em tempo real sob lock; o cron apenas materializa.
- **Escala**: mecanismo único permanece o trigger `dp_convocacao_sync_escala`, **estendido cirurgicamente** para os novos estados. Sem flag de sessão, sem segundo mecanismo, sem função paralela de sincronização nesta fase (essa fica para o cutover da Fase 4).
- **Publicação atômica**: grupo + ocorrências + ofertas validados antes; erro estrutural em qualquer ocorrência aborta toda a publicação; locks em ordem determinística.
- **Elegibilidade completa** no backend: empresa, unidade, vínculo, cargo aplicável, regime intermitente/freelancer, configuração de trabalho vigente, indisponibilidade global na data, conflito com `dp_escala_itens`, conflito com convocação bloqueante na mesma data, compatibilidade integral com a janela, horário ofertado, virada de dia e Option A. `compoe_equipe_habitual` **não** é critério. Compatibilidade V1 só `integral`/`incompativel`.
- **Locks do aceite**: oferta + ocorrência + trabalhador/data (lock de registro apropriado ou advisory lock transacional documentado); não depender de `uq_dp_convocacoes_ativa`.
- **Vaga ≠ bloqueio de pessoa**: listas de estados distintas — vaga conta só ofertas aceitas que ainda ocupam a ocorrência; bloqueio da pessoa segue Option A e considera alocação consumida/histórica.
- **Preenchimento/reabertura**: última vaga aceita → ocorrência `preenchida` e pendentes → `encerrada_sem_vaga` (nunca `recusada`). Reabertura por desistência não ressuscita ofertas encerradas; novas ofertas são materializadas e auditadas.
- **Substituição com consentimento**: original segue ocupando a vaga até o substituto aceitar; no aceite, mesma transação marca original `substituida` e substituto `aceita`. Recusa/sem resposta mantém a original `aceita`. `aprovacao_modo = automatica` não elimina o consentimento.
- **Descumprimento separado da operação**: ações criam registro com `analise = pendente`; RPC administrativa distinta classifica; só `sem_justo_motivo` + snapshot `intermitente` grava a referência de 50%. Freelancer nunca recebe referência CLT.
- **Indisponibilidade**: só data futura; global por colaborador/data; encerra atomicamente as pendentes do dia; oferta aceita bloqueia a marcação e direciona para desistência/substituição; retirar restaura elegibilidade futura sem reabrir ofertas antigas; `company_id` derivado.
- **Encerramento automático**: função interna idempotente + agendamento persistente por mecanismo de banco disponível, processando pelo primeiro threshold cronológico independentemente de atraso.
- **Comparecimento** separado do status (`compareceu`/`ausente`), sem novos valores no enum; ausência gera descumprimento pendente.
- **Idempotência explícita por RPC** (estado esperado, constraints, IDs determinísticos ou chave de comando); retry de publicação nunca duplica oferta; sem tabela genérica de idempotência sem justificativa.
- **Coluna real** `origem_oferta` (`convocacao`/`substituicao`); nenhuma coluna paralela.
- **Remuneração**: antes de `remuneracao_snapshot`, diagnosticar a fonte real (fonte, campos, vigência, cálculo, snapshot). Sem dados suficientes → PARAR o subfluxo e apresentar diagnóstico.
- **Segurança das RPCs**: `REVOKE EXECUTE` de PUBLIC/anon, grant mínimo, `auth.uid()`, validação admin/owner ou próprio colaborador, empresa derivada de entidade autoritativa (grupo pela unidade; config company-level valida vínculo/papel), `search_path` seguro, referências qualificadas, nada de timestamps/status/actor/company do cliente, erros padronizados.

## 2. Bloco autorizado agora — 3B.1: coexistência segura + planejamento/configuração

**Auditoria antes de qualquer alteração**: as policies atuais de `dp_convocacoes` são `dp_convocacoes_admin_all` (ALL, admin/owner da empresa), `dp_convocacoes_read_self` (SELECT do próprio) e `dp_convocacoes_respond_self` (UPDATE do próprio, de `pendente` para `aceita`/`recusada`). Serão reescritas preservando o caminho legado e fechando o novo:

- `admin_all` deixa de cobrir DML em linhas com `ocorrencia_id IS NOT NULL` (mantendo leitura); `respond_self` passa a exigir `ocorrencia_id IS NULL`; leitura do colaborador continua abrangendo as ofertas novas para o Portal.
- INSERT direto de linha com `ocorrencia_id` preenchido fica impossível para `authenticated`; RPCs `SECURITY DEFINER` são o único caminho.
- Também será auditado se o `dp_convocacao_guard` precisa de ajuste para diferenciar os dois caminhos sem alterar o comportamento legado.

**Entregas do bloco**
1. Migration de coexistência (policies/grants + eventual ajuste do guard).
2. RPCs de rascunho: criar/editar grupo (empresa derivada da unidade) e ocorrências (necessidade, horário ofertado, vagas, condições comuns), com validações estruturais e idempotência definida.
3. RPC de revisão/versionamento de ocorrência (sucessora única, bloqueio da anterior na mesma transação).
4. RPC de configuração por empresa/unidade, leitura sempre por `dp_convocacao_config_resolvida`.
5. Eventos registrados em `dp_convocacao_eventos` para cada operação.

**Testes do bloco** (transação revertida, sem resíduo): legado intacto (criar/cancelar/excluir/aceitar/recusar direto continua funcionando); DML direto em linha nova rejeitado em INSERT/UPDATE/DELETE, por admin e por colaborador; multiempresa negativo pelas novas RPCs; retry de cada RPC sem duplicar; grants/`EXECUTE` conferidos; comparação com o baseline do item 0.

**Fechamento**: relatório com migrations aplicadas, SQL efetivo, testes, arquivos alterados, tipos regenerados, rollback e confirmação de zero registros artificiais. Então PARO e aguardo aprovação.

## 3. Blocos seguintes (não executar agora)

3B.2 publicação (timezone, dias úteis, antecedência, público, elegibilidade, snapshots, geração idempotente) · 3B.3 resposta, vagas, Option A, preenchimento e extensão cirúrgica do trigger de escala · 3B.4 indisponibilidade, encerramentos, job e comparecimento · 3B.5 desistência, substituição, cancelamento patronal e análise de descumprimento.

## Notas técnicas

- Nenhum arquivo de frontend é alterado na 3B.1; `src/integrations/supabase/types.ts` é regenerado após as migrations.
- `dp_convocacoes_respond_self` e o trigger legado continuam existindo; a remoção coordenada acontece só no cutover da Fase 4.
