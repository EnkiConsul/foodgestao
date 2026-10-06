# Reestruturação de Clientes, Assinaturas e Isenções

Substitui o plano anterior da tela de Clientes (agora Fase 3). Nada será implementado antes da sua aprovação, e cada fase é aprovada separadamente.

## Retrato real de hoje (consultado no banco)
- `subscriptions` já tem as colunas `module` e `company_id`, além de `user_id`. Ou seja, o modelo já está meio caminho andado: existe uma assinatura por módulo, mas o acesso continua olhando só o dono.
- Situação atual: 52 assinaturas. Nenhuma ativa tem vínculo com o Asaas. São **39 ativas isentas**, **1 ativa sem isenção e sem Asaas** (vazamento já existente), 8 em teste e 4 canceladas.
- `company_access_status` percorre todas as assinaturas do dono (`s.user_id = v_owner`) e libera a empresa na primeira válida, sem olhar `module` nem `company_id`. Isso confirma os problemas 1 e 2.
- Rotinas do banco que leem `subscriptions`: `company_access_status`, `assinatura_limites`, `assinatura_limite_excedido`, `subscription_capacity`, `subscription_total_cents`, `get_user_plan_features`, `expire_trials_and_exemptions`, `handle_new_user_subscription`, `subscriptions_default_company`, `companies_link_subscription`, `subscription_addon_set_prorata`, `billing_dunning_scan/pausar/historico`, `billing_set_dunning_stage`, `system_health_snapshot`.
- Funções de servidor: `asaas-create-checkout`, `asaas-refresh-pix`, `asaas-cancel-subscription`, `asaas-webhook-worker`, `asaas-webhook-test`, `assinatura-adicional`, `sync-extra-companies`, `admin-exempt-subscription`, `admin-remove-exemption`, `admin-company-owners`.
- Telas e hooks: `AdminUsers`, `ExemptSubscriptionDialog`, `AdminBillingMetrics`, `useBilling`, `useCurrentSubscription`, `useMinhaAssinatura`, `usePlans`, `useCompanyAccess`, `useModuleEntitlement`, `ModuleGuard`.
- O congelamento de versão está encerrado (`frozen: false`).

## (a) Riscos e pontos de atenção da migração
1. **Dono como chave por todo lado.** As 15 rotinas e 10 funções de servidor acima filtram por `user_id`. A migração não pode trocar tudo de uma vez: `subscriptions.user_id` fica como coluna legada, só para leitura, até a Fase 2 terminar.
2. **Limites de plano.** `assinatura_limites` e os gatilhos `dp_guard_limite_*` barram colaboradores e unidades. Se passarem a ler o novo modelo antes da hora, empresas podem ser barradas por engano. Eles migram junto com `has_module_access`, nunca antes.
3. **`company_id` atual mal preenchido.** O gatilho `subscriptions_default_company` coloca a primeira empresa do dono, e `extra_companies` conta empresas sem dizer quais são. Na migração a cobertura deve ser montada a partir de **todas as empresas do dono**, ignorando `company_id`.
4. **Membros convidados.** Hoje o convidado herda o acesso pela assinatura do dono. No modo grupo a regra continua igual. Ela muda apenas se o dono passar uma empresa para o modo empresa sem contratar.
5. **Isenções permanentes.** Hoje `exempt_until` nulo significa "para sempre". Isso vira concessão com motivo `cliente_base_anterior`. Precisamos ver quantas das 39 têm data e quantas não têm.
6. **A 1 ativa sem Asaas e sem isenção.** É preciso decidir se ela vira concessão ou entra em carência.
7. **Faturas históricas.** `invoices.subscription_id` continua válido porque a assinatura vira a da conta de cobrança. Faturas antigas de várias assinaturas do mesmo dono ficam ligadas às assinaturas legadas, que são arquivadas e nunca apagadas.
8. **`user_id` em `invoices`** é usado pelas regras de acesso (RLS) e pelo `useAdminInvoices`. Será incluída `billing_account_id`, e as regras passam a aceitar o responsável financeiro.
9. **Validação antes/depois.** Rodar `company_access_status` para todas as empresas antes da migração e guardar o resultado. Depois, comparar com `has_module_access` por módulo. Meta: zero empresa que estava liberada aparecer como bloqueada.
10. **Sem bloqueio retroativo.** Na Fase 2 as guardas por módulo rodam primeiro em modo "observar" (registram a diferença sem bloquear) por alguns dias.

## (b) Mudanças no Asaas e na régua de cobrança
- **Cliente Asaas por conta de cobrança.** Hoje `external_customer_id` fica na assinatura. Ele passa para `billing_accounts.asaas_customer_id`, com o CNPJ do tomador, e não depende mais de quem fez o checkout.
- **Uma assinatura Asaas por conta**, com valor igual à soma dos itens vigentes menos as concessões. `subscription_total_cents` é reescrita para somar `subscription_items` × cobertura. Quando um item muda, o valor é atualizado no Asaas com `POST /v3/subscriptions/{id}`, aplicado só a partir do próximo ciclo.
- **Valor zero.** O Asaas não aceita assinatura de R$ 0. Uma conta 100% em cortesia fica sem assinatura no Asaas, e ela só é criada quando a concessão vence ou é revogada.
- **Checkout.** `asaas-create-checkout` passa a receber `billing_account_id` e os itens escolhidos, em vez de um único plano. A proteção "Asaas respondeu sem ID" (`requireAsaasId`) é mantida.
- **Webhook e worker.** Localizam a assinatura por `asaas_subscription_id` (já é assim). Toda mudança de estado passa por uma função única `billing_transition(...)`, que é idempotente e grava em `subscription_events`. O worker deixa de fazer update direto.
- **NFS-e.** Emitida quando a fatura é paga, com o tomador da conta de cobrança. Fatura zerada não emite nota.
- **Régua por e-mail.** `billing_dunning_scan` passa a varrer contas de cobrança, com o e-mail de cobrança da conta e não o do dono. Incluir os gatilhos "carência vencendo" e "cortesia vencendo" (D-15, D-7, D-3), sempre só por e-mail e a partir das 08h. A pausa por negociação (`dunning_paused_until`) passa para a assinatura da conta.
- **Adicionais e pró-rata.** `subscription_addons` e `prorata_cents` deixam de existir nesta fase (as mudanças valem no próximo ciclo). Os registros atuais são preservados apenas para histórico.

## (c) Divergências entre o modelo proposto e o código atual
1. `subscriptions.module` e `company_id` já existem. O modelo proposto move o módulo para `subscription_items`. Proposta: manter essas colunas como legadas e congeladas, sem apagar.
2. Os estados atuais (enum `subscription_status`) incluem `pending` e não têm `grace` nem `suspended`. Será preciso acrescentar valores ao enum. Remover `pending` exige mapear os registros para `trialing` ou `past_due`.
3. As faixas de bloqueio de hoje (10/30/90 dias: suspenso, rescindido, expirado) são calculadas na leitura a partir da fatura vencida, não guardadas como status. A máquina de estados proposta guarda o status. Proposta: um job diário aplica as transições e `has_module_access` continua tolerando 10 dias, para ficar igual ao comportamento atual.
4. `billing_variant` (`monthly_flex`), `loyalty_started_at`, `paid_months_count` e `next_free_month` (fidelidade 360, com mês grátis) não aparecem no modelo. Proposta: o mês grátis da fidelidade vira uma concessão automática `cortesia_100` de um ciclo.
5. Planos com teto de colaboradores e empresas (Essencial, Gestão, Multiempresa) conflitam com o "preço por quantidade de unidades" do modo grupo. Preciso que você decida: no modo grupo o preço vem do plano × unidades, ou de uma tabela de faixas por quantidade?
6. Cupons (`coupons`, `coupon_redemptions`) aplicam desconto na fatura. É preciso decidir se viram `desconto_percentual` em `subscription_grants` ou continuam separados.
7. `handle_new_user_subscription` cria um teste no cadastro do usuário. No novo modelo o teste nasce quando a empresa é criada, por item de módulo.
8. `ModuleGuard`/`useModuleEntitlement` e `can_use_module` já existem para os módulos. Eles passam a chamar `has_module_access` em vez de duplicar a regra.

## Fases e complexidade
| Fase | Conteúdo | Complexidade |
|---|---|---|
| 0 | `admin-remove-exemption` coloca em `grace` com data (10 dias), registra o motivo e gera o link de checkout. Relatório das ativas sem Asaas (hoje 40). | Baixa: 1 função de servidor e 1 consulta |
| 1 | Tabelas novas com permissões e RLS, enum ampliado, `subscription_events` só de inclusão, `billing_transition`, migração dos dados e comparação antes/depois | Alta: o ponto mais arriscado |
| 2 | `has_module_access`, nova versão de `company_access_status` e `assinatura_limites`, guardas separadas para Financeiro e Pessoas (primeiro só observando), adaptação de checkout, worker e régua | Alta |
| 3 | Backoffice Cliente 360: lista por conta de cobrança/empresa, módulos lado a lado, MRR, selo de cortesia, filtros (venda cruzada, vencendo em 30 dias) e ações com motivo obrigatório | Média |
| 4 | Métricas (MRR bruto e líquido, custo das cortesias, conversão de teste, inadimplência), tela do cliente para escolher o modo empresa ou grupo, banners de prazo | Média |

## Detalhes técnicos
- Tabelas novas seguem a ordem: criar, conceder permissões (`authenticated` só leitura; gravação apenas por `service_role` ou rotinas `SECURITY DEFINER`), ativar RLS, criar regras.
- `subscription_grants`: gatilho de validação (não CHECK) exige `ends_at`, exceto quando o motivo é `cliente_base_anterior`. Bloqueio de DELETE em `subscription_grants` e `subscription_events`.
- Índice único parcial: uma empresa com apenas uma conta de cobrança ativa (`ended_at is null`).
- `has_module_access(company_id, module)` é `STABLE SECURITY DEFINER`, com `GRANT EXECUTE` para `authenticated`, porque o app e as regras de acesso a chamam.
- Regras novas ficam registradas no `AGENTS.md`, substituindo a regra atual de cobrança e limites.

## Decisões que preciso de você antes da Fase 1
1. Preço no modo grupo: plano × unidades ou faixas de quantidade?
2. Cupons viram concessões ou continuam separados?
3. A assinatura ativa sem isenção e sem Asaas: cortesia ou carência?
4. Prazo padrão de carência: confirmar 10 dias.
