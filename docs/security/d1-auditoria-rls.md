# D1 — Auditoria de isolamento multiempresa (RLS, grants, RPC, Storage)

Etapa **somente leitura** em produção (`grtxmbffgmgnkawlvqhm`), executada em 21/09/2026.
Fonte: catálogos reais do banco (`pg_class`, `pg_policy`/`pg_policies`, `pg_proc`, `pg_namespace`,
`storage.buckets`, `storage.objects` policies) — **não** apenas os arquivos de migration.
Nenhum schema, permissão, política, conta ou chave foi alterado. Nenhuma linha pessoal ou
financeira foi lida: apenas metadados e definições.

Artefatos (sem dados e sem segredos) em `docs/security/d1/`:

| Arquivo | Conteúdo |
|---|---|
| `02-tables-rls.csv` | tabelas/partições/views por schema com `relrowsecurity` e `relforcerowsecurity` |
| `03-grants.csv` | grants efetivos de `anon`/`authenticated`/`service_role`/`PUBLIC` por tabela |
| `04-policies.csv` | matriz tabela × policy × operação com `USING` e `WITH CHECK` completos |
| `05-views.csv` | views/materializadas e `security_invoker` |
| `06-functions.csv` | funções com `prosecdef`, `search_path` e EXECUTE por role |
| `07-schema-usage.csv` | `USAGE` de schema por role |
| `09-definer-sem-uid.csv` | funções `SECURITY DEFINER` com parâmetro de empresa/usuário e sem `auth.uid()` |
| `d1-catalogo-resumo.json` | resumo agregado da coleta |
| `d1-teste-isolamento-homologacao.sql` | roteiro de teste controlado — **não executado** |

## 1. Panorama confirmado

- Schemas existentes: `public`, `private`, `qa`, `storage`, `auth`, `cron`, `pgmq`, `net`,
  `vault`, `realtime`, `graphql`, `graphql_public`, `extensions`, `supabase_migrations`, `pgbouncer`.
- `USAGE`: `anon` → `public`, `storage`, `extensions`. `authenticated` → também `private`.
  `qa` → somente `service_role`. Não há `USAGE` de cliente em `auth`, `vault`, `cron`, `pgmq`.
- **215 tabelas/partições base em `public`, todas com RLS habilitada** (`tabelas_public_sem_rls: []`).
  `FORCE ROW LEVEL SECURITY` só em `public.coupons` e `public.coupon_redemptions`.
- 456 policies: 367 só `authenticated`, 55 sem role explícito (`{public}`), 19 `anon,authenticated`,
  5 `anon`, 10 `service_role`.
- Policies com predicado `true`: **somente 10, todas restritas a `service_role`** (filas de e‑mail,
  `pluggy_v2_*`, `pluggy_webhook_events`). Não há tautologia para `anon`/`authenticated`.
- Views expostas em `public`: `company_member_profiles`, `dp_colaboradores_public`,
  `transaction_sources` — **todas com `security_invoker = true`** e, no caso de
  `company_member_profiles`, com filtro por `auth.uid()` + `private.get_user_company_ids`.
- Storage: 6 buckets, **todos privados** (`public = false`); policies de `storage.objects` escopadas
  por empresa (`private.is_company_admin_or_owner`, join em `transactions`/`company_members`) ou por
  pasta do próprio usuário.
- Chave do frontend: `VITE_SUPABASE_PUBLISHABLE_KEY`, cujo token traz `role = anon`
  (verificado sem imprimir o valor). `SUPABASE_SERVICE_ROLE_KEY` **ausente** do `.env` do frontend e
  nenhuma referência a chave de serviço em `src/`, `index.html` ou `public/` (só asserções de teste).
- Advisors read-only (linter): 2 avisos "Extension in Public", 7 "Public Can Execute SECURITY DEFINER
  Function", 242 "Signed-In Users Can Execute SECURITY DEFINER Function". Nenhum aviso de RLS
  desabilitada ou policy permissiva.

RLS habilitada **não** é tratada aqui como prova de isolamento: os achados abaixo vêm da leitura dos
predicados, dos grants e dos corpos das funções privilegiadas. Também não é tratada como cobertura
universal: **`TRUNCATE` não é filtrado por RLS** (ver A5), e chaves estrangeiras não carregam empresa
(ver A7).

Duas ressalvas de método, aplicadas no texto abaixo:
- `USAGE` em um schema **não** prova exposição via REST. O schema `private` não é schema exposto do
  PostgREST; um helper executável ali é superfície de banco, não exploração HTTP comprovada.
- Uma função `SECURITY DEFINER` sem `auth.uid()` **não** é, por si, um exploit: a autorização pode
  estar na cadeia de chamada. A lista de 59 é **triagem**, não 59 vulnerabilidades.

## 2. Matriz das tabelas prioritárias (predicados reais)

| Tabela | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| `transactions` | membro da empresa (`private.is_company_member`) com recorte extra para contabilidade; super admin | `private.member_can_edit(uid, company_id, 'transactions')` em `USING` e `WITH CHECK`; trigger `prevent_company_id_transfer_trg` impede reatribuir `company_id` |
| `accounts` | membro da empresa (+ regra `is_accounting`) | `private.member_can_edit(..., 'accounts')` em `USING`/`WITH CHECK` |
| `categories` | escopo por empresa/visibilidade | idem por empresa |
| `credit_cards` | próprio (`company_id IS NULL`) ou membro | `member_can_edit(..., 'transactions')` com `WITH CHECK` simétrico |
| `companies` | dono ou membro; super admin | update só admin/dono, com `WITH CHECK` que congela o dono (`company_owner_snapshot`) + triggers anti transferência |
| `profiles` | somente `auth.uid() = user_id`; super admin lê | somente o próprio registro |
| `invoices` | somente `auth.uid() = user_id`; super admin gerencia | sem escrita de cliente |
| `pluggy_connections`, `pluggy_accounts`, `pluggy_staging_transactions`, `pluggy_v2_*` | SELECT por empresa | **sem grant de escrita para cliente** (`authenticated` só `SELECT`); escrita via `service_role`/RPCs |

Os predicados desse núcleo são consistentes: todos usam `auth.uid()` e helpers `private.*`, nunca um
`company_id` vindo do cliente como fonte de verdade. **Isso não significa que o núcleo esteja seguro.**
O predicado decide sobre a coluna `company_id` da própria linha, e não sobre as linhas referenciadas
por ela: as chaves estrangeiras (`account_id`, `credit_card_id`, `category_id`, `contact_id`,
`cost_center_id`) não carregam empresa e não têm guard equivalente ao da conta de destino — é
exatamente o caminho confirmado em A7. A conclusão sobre o núcleo só pode ser dada depois de fechar
esse item.

## 3. Achados

### A1 — ALTO: RPC `SECURITY DEFINER` sem nenhuma checagem de acesso, chamável por qualquer um
`public.dp_admissao_regras_resolver(p_company_id, p_unidade_id, p_cargo_id, p_regime[, p_sexo])`
(duas sobrecargas) é `SECURITY DEFINER`, lê `dp_admissao_regras` filtrando **apenas pelo
`p_company_id` recebido** e **não referencia `auth.uid()`**. EXECUTE está concedido a `anon` e
`authenticated`. Evidência: `09-definer-sem-uid.csv` (linhas `dp_admissao_regras_resolver`) e corpo
lido do catálogo. Efeito: qualquer visitante, sem sessão, lê as regras de admissão de qualquer
empresa informando o identificador dela.

### A2 — TRIAGEM (não confirmado): 59 funções `SECURITY DEFINER` que confiam no parâmetro recebido
**Esta é uma lista de triagem, não 59 vulnerabilidades.** Cada item precisa de verificação individual:
a autorização pode estar na cadeia de chamada (função chamadora, trigger, RPC de fachada), e parte
delas provavelmente nunca é chamada direto pelo cliente. Severidade fica indefinida até a verificação
caso a caso; os itens de escrita abaixo são os candidatos prioritários.

Critério da triagem: funções em `public` executáveis por `authenticated` que recebem
`company_id`/`colaborador_id`/`user_id` e não
consultam `auth.uid()` nem helper de vínculo — logo ignoram RLS em nome do dono da função. Exemplos
verificados no corpo:
- Leitura cruzada: `dp_config_resolvida`, `dp_ocorrencia_config`, `dp_ferias_config`,
  `dp_ferias_validar_programacao`, `dp_convocacao_*`, `dp_folga_*`, `dp_jornada_dia_prevista`,
  `dp_setor_previsto`, `get_password_change_required(_user_id)`,
  `is_company_admin_or_owner(_user_id, _company_id)` (permite sondar papel de outro usuário).
- **Escrita cruzada**: `dp_notificar_admins_empresa` (INSERT direto em `dp_notificacoes` de qualquer
  empresa), `seed_default_contacts` / `seed_default_payment_methods` (INSERT com `_user_id`
  arbitrário), `dp_folga_atribuir_admin` (delega a `dp_solicitacao_criar_admin`; a cadeia precisa ser
  reverificada função por função).
Lista completa em `09-definer-sem-uid.csv`. O fato objetivo é o EXECUTE concedido a `authenticated` em
schema exposto; a explorabilidade de cada uma é o que falta verificar.

### A3 — MÉDIO: sobrecarga nova de RPC de conciliação voltou a ser executável por `anon`
`public.pluggy_clear_pending_staging(_company_id uuid, _ids uuid[])` tem `anon:EXECUTE` (o padrão
`PUBLIC` não foi revogado ao criar a sobrecarga), enquanto a variante anterior
`(_company_id, _connection_id)` está corretamente restrita a `authenticated`/`service_role`.
Mitigação existente: o corpo levanta `not_authenticated` quando `auth.uid()` é nulo — não há
exploração direta, mas a divergência é exatamente a regressão que o item anterior fechou.

### A4 — BAIXO, exploração HTTP não comprovada: helpers de `private` com `EXECUTE` para `PUBLIC`
`private.pluggy_can_edit`, `private.pluggy_can_manage_accounts`, `private.pluggy_module_edit`,
`private.dp_pode_agir`, `dp_pode_ver_documentos`, `dp_portal_decisao`, `is_company_owner`,
`is_dp_colaborador_of_company` têm `PUBLIC:EXECUTE`. Medição de privilégio efetivo:
`has_schema_privilege('anon','private','USAGE') = false`,
`has_schema_privilege('authenticated','private','USAGE') = true`, `CREATE` negado para ambos.

**Qualificação:** `USAGE` no schema não implica alcance pela API. `private` não é schema exposto do
PostgREST, então a chamada não é possível por HTTP pelo caminho normal do aplicativo — nenhuma
exploração foi demonstrada. O que fica registrado é superfície de banco a apertar (o helper deveria ser
exclusivo de `service_role`, como já foi feito em `pluggy_user_can_edit`), não um vazamento
confirmado. Se a exposição de schema mudar, o item vira imediatamente vazamento booleano de
vínculo/papel de outro usuário.

Ainda em `private`, duas funções `SECURITY DEFINER` que executam SQL dinâmico têm EXECUTE para
`authenticated`: `private.apply_audit_log_partition_policies` e `private.manage_audit_logs_partitions`
(DDL de partição de auditoria). Mesma qualificação de alcance; mesma recomendação de restringir a
`service_role`. A única função de schema exposto com SQL dinâmico é `public.dp_ficha_aplicar`, que é
`SECURITY INVOKER` (portanto sujeita à RLS) e monta colunas por lista branca com lista de campos
proibidos — verificada e sem injeção de identificador.

### A5 — MÉDIO: grants de tabela que a RLS não cobre (`TRUNCATE`) e escrita ampla para `anon`
Correção de classificação: o item anterior tratava todos os grants como "protegidos pela RLS". **Isso
é falso para `TRUNCATE`** — a RLS não filtra `TRUNCATE`; quem tem o privilégio apaga a tabela inteira
sem passar por policy alguma. Medição por `has_table_privilege` sobre as 215 tabelas base de `public`
(nenhum comando destrutivo foi executado):

| Privilégio | `anon` | `authenticated` |
|---|---|---|
| `SELECT` | 162 | 206 |
| `INSERT` | 165 | 185 |
| `UPDATE` | 167 | 185 |
| `DELETE` | 167 | 186 |
| **`TRUNCATE`** | **167** | **186** |
| `TRIGGER` | 168 | 194 |
| `REFERENCES` | 167 | 186 |
| `MAINTAIN` | 168 | 199 |

Inclui `accounts`, `companies`, `profiles`, `categories`, `audit_logs*` e `pluggy_webhook_events`.

Alcance real, medido: PostgREST não expõe `TRUNCATE` (não há verbo para isso), nenhuma função
executável por `anon`/`authenticated` contém `TRUNCATE` no corpo (varredura em `pg_proc`), e
`CREATE` em `public`/`private` está negado às duas roles — logo `TRIGGER` e `REFERENCES` não permitem
criar gatilho nem chave estrangeira. **Nenhum caminho de exploração por HTTP foi comprovado**, e é por
isso que o item é MÉDIO e não ALTO. Mas a afirmação "a RLS protege" não se sustenta: basta qualquer
superfície futura que execute SQL arbitrário sob a role do cliente para o dano ser total e irreversível.
Recomendação: `REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN` de `anon` e `authenticated` em `public`,
e revogar também a escrita de `anon` onde nenhuma policy a concede.
Lista em `d1-catalogo-resumo.json → tabelas_com_grant_escrita_anon`.

### A6 — BAIXO (funcional, não isolamento): `public.accounts` sem `UPDATE` para `authenticated`
As policies permitem UPDATE ao editor da empresa, mas o grant de tabela não inclui `UPDATE`
(`03-grants.csv`: `accounts|authenticated|DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE`).
Qualquer edição direta de conta pela API falha por permissão antes da RLS — hoje depende de RPC.

### A7 — ALTO: conta/cartão de outra empresa no lançamento altera o saldo dela
Registrado em detalhe em `docs/security/d1-achado-a7-conta-do-lancamento.md`. Resumo: `account_id` e
`credit_card_id` não têm guard de empresa (só `destination_account_id`, e só em transferência), e o
cálculo de saldo é `SECURITY DEFINER` sem checagem de tenant.

Exploração **executada em homologação** (transação revertida): o saldo da conta da outra empresa passou
a 7. Em **produção** a confirmação é por **definições e caminho de código** — gatilhos, constraints e
corpos de função batem com o ambiente de teste — mais **contagens agregadas**; nenhuma exploração foi
executada em produção.

Contagens agregadas em produção (`docs/security/d1/d1-a7-contagens.sql`, somente `count(*)`, sem expor
identificador, nome ou valor): em 159 lançamentos, **0** com conta de outra empresa, **0** com cartão de
outra empresa, 0 com conta de destino/categoria/contato divergentes, 0 em contexto pessoal (a base é
100% empresarial); 1 sem conta e 158 sem cartão, casos válidos pela constraint
`transactions_source_xor`. Ou seja: **superfície aberta, sem dano registrado até agora** — e a correção
pode validar `INSERT` e `UPDATE` sem travar edição de histórico, porque não há linha legada divergente.
O SQL da correção está apenas **preparado**, não aplicado nesta auditoria.

### Pontos verificados, com o alcance da verificação explícito
- `get_accessible_accounts` e `get_accessible_categories`: exigem sessão e `private.is_company_member`
  antes de retornar; `company_access_status` e `auth_access_enabled` derivam de `auth.uid()`.
  Verificado no corpo das funções e, para `get_accessible_accounts`, também em homologação (`42501`
  para empresa alheia).
- Nenhuma função `SECURITY DEFINER` sem `search_path` fixado (medido em `pg_proc.proconfig`).
- Triggers anti reatribuição de tenant presentes em `transactions` e nas associativas
  (`prevent_association_tenant_change` em `category_companies`, `chart_account_companies`,
  `contact_companies`, `payment_method_companies`) e em `companies` (transferência de dono). Isso cobre
  a **troca de `company_id` da própria linha**, e não as referências para outras empresas (A7).

## 4. Evidências de execução (homologação `utjhzpdbqzajrhnzcher`)

Testes feitos **em homologação**, dentro de `BEGIN ... ROLLBACK`, com contas temporárias A e B criadas
no próprio teste (`context = 'pj'`), `SET LOCAL ROLE authenticated` e JWT com `sub` do usuário A.
Limpeza confirmada ao final: contas e lançamentos de teste = 0. Nenhum dado real envolvido.

| Cenário | Resultado |
|---|---|
| Leitura e CRUD cruzados por `company_id` | **bloqueados** |
| `get_accessible_accounts('pj', empresaB, false)` | **`42501`** |
| INSERT `company_id = A`, `account_id` = conta **B**, `context = 'pj'`, confirmada, `amount = 7` | **aceito** e o **saldo da conta B passou a 7** via `trg_sync_account_balance` → `apply_tx_balance` (`SECURITY DEFINER`) |
| INSERT `company_id = A`, `account_id` = conta **A**, mesmas condições | aceito, saldo da conta A = 7 (comportamento legítimo, serve de controle) |
| Rodada anterior (menos refinada): INSERT com `account_id` de outra empresa | aceito, 1 linha; inverso também aceito |

A homologação é uma base **antiga**, então nada disso foi concluído como vulnerabilidade de produção a
partir dela. A comparação foi feita lendo o catálogo de produção: `public.apply_tx_balance` continua
`SECURITY DEFINER` e atualiza `accounts.current_balance` por `_tx.account_id`/`_tx.destination_account_id`
sem nenhuma verificação de empresa ou vínculo; e a lista de gatilhos de `transactions` em produção não
tem nenhuma validação de empresa para a conta de origem nem para o cartão. **Os dois lados batem** — por
isso A7 está classificado como confirmado em produção, sem que nenhum lançamento tenha sido criado lá.

## 5. Limites desta etapa (declarados)

- Em **produção** houve apenas leitura de catálogo: nenhum teste com sessão real, nenhum INSERT,
  nenhum comando destrutivo. As contagens de privilégio vieram de `has_table_privilege`;
  `TRUNCATE` **nunca foi executado**, em nenhum ambiente.
- A prova de execução existe só em homologação, cuja base é antiga; a extrapolação para produção se
  apoia na comparação de corpo de função e de gatilhos, declarada acima.
- `information_schema.role_table_grants` não é visível ao papel de leitura usado; os grants vieram de
  `aclexplode(pg_class.relacl)` e foram conferidos com `has_table_privilege`.
- A configuração do PostgREST (schemas expostos, `db-extra-search-path`) **não** é legível por SQL.
  Onde o alcance por HTTP não pôde ser medido, isso está dito no próprio achado (A4, A5) em vez de
  assumido em qualquer direção.
- A2 é triagem: a cadeia de chamada das 59 funções não foi percorrida, nenhuma delas está confirmada
  como explorável, e cada uma exige verificação antes de revogação para não quebrar triggers e fluxos.
- Contagens agregadas apenas; nenhuma linha de dado pessoal ou financeiro foi lida ou registrada.

## 6. Próxima etapa (preparada, não executada)

Ver também `docs/security/d1-achado-a7-conta-do-lancamento.md` (achado A7, registrado separadamente).

`docs/security/d1/d1-teste-isolamento-homologacao.sql` traz o roteiro controlado para **homologação**,
com duas empresas e dois usuários fictícios, cobrindo: positivos do próprio tenant; negativos cruzados
em SELECT/INSERT/UPDATE/DELETE; tentativa de reatribuir `company_id`; FK apontando para linha de outra
empresa; RPCs e views; usuário sem vínculo; e `anon`. O arquivo é idempotente, roda dentro de
transação com `ROLLBACK` e **não deve ser executado em produção**.
