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

### A2 — ALTO (sistêmico): 59 funções `SECURITY DEFINER` confiam no parâmetro de empresa/colaborador
Funções em `public` executáveis por `authenticated` que recebem `company_id`/`colaborador_id` e não
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
Lista completa em `09-definer-sem-uid.csv`. Muitas dessas funções provavelmente só são chamadas por
triggers ou por outras funções privilegiadas — mas o EXECUTE para `authenticated` as torna alcançáveis
direto pela API.

### A3 — MÉDIO: sobrecarga nova de RPC de conciliação voltou a ser executável por `anon`
`public.pluggy_clear_pending_staging(_company_id uuid, _ids uuid[])` tem `anon:EXECUTE` (o padrão
`PUBLIC` não foi revogado ao criar a sobrecarga), enquanto a variante anterior
`(_company_id, _connection_id)` está corretamente restrita a `authenticated`/`service_role`.
Mitigação existente: o corpo levanta `not_authenticated` quando `auth.uid()` é nulo — não há
exploração direta, mas a divergência é exatamente a regressão que o item anterior fechou.

### A4 — MÉDIO: helpers de permissão em `private` com `EXECUTE` para `PUBLIC`
`private.pluggy_can_edit`, `private.pluggy_can_manage_accounts` e `private.pluggy_module_edit` têm
`PUBLIC:EXECUTE`; `private.dp_pode_agir`, `dp_pode_ver_documentos`, `dp_portal_decisao`,
`is_company_owner`, `is_dp_colaborador_of_company` idem. `anon` **não** tem `USAGE` em `private`
(portanto não alcança), mas `authenticated` tem: qualquer usuário logado pode consultar a permissão de
**outro** usuário em **qualquer** empresa passando `_user_id`/`_company_id` (vazamento booleano de
vínculo/papel).

### A5 — BAIXO: grants amplos de escrita para `anon` em 173 tabelas de `public`
Herança do padrão do Supabase. O bloqueio efetivo hoje é só a RLS (nenhuma policy concede escrita a
`anon`, e as policies `{public}` exigem `auth.uid()`). Ainda assim é superfície desnecessária —
inclusive em `companies`, `profiles`, `categories`, `audit_logs*` e `pluggy_webhook_events`.
Lista em `d1-catalogo-resumo.json → tabelas_com_grant_escrita_anon`.

### A6 — BAIXO (funcional, não isolamento): `public.accounts` sem `UPDATE` para `authenticated`
As policies permitem UPDATE ao editor da empresa, mas o grant de tabela não inclui `UPDATE`
(`03-grants.csv`: `accounts|authenticated|DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE`).
Qualquer edição direta de conta pela API falha por permissão antes da RLS — hoje depende de RPC.

### Pontos verificados e íntegros
- `get_accessible_accounts` e `get_accessible_categories`: exigem sessão e `private.is_company_member`
  antes de retornar; `company_access_status` e `auth_access_enabled` derivam de `auth.uid()`.
- Nenhuma função `SECURITY DEFINER` sem `search_path` fixado.
- Triggers anti reatribuição de tenant presentes em `transactions` e nas associativas
  (`prevent_association_tenant_change` em `category_companies`, `chart_account_companies`,
  `contact_companies`, `payment_method_companies`) e em `companies` (transferência de dono).

## 4. Limites desta etapa (declarados)

- Houve acesso SQL real de leitura ao catálogo de produção; **não** houve execução de teste de
  isolamento com sessões reais (exigiria criar usuários/linhas, fora do escopo autorizado).
- `information_schema.role_table_grants` não é visível ao papel de leitura usado; os grants foram
  obtidos por `aclexplode(pg_class.relacl)`, que é a fonte autoritativa.
- Configuração do GoTrue/PostgREST (schemas expostos, `db-extra-search-path`) não é legível por SQL;
  a exposição foi inferida do `USAGE` por schema e das RPCs alcançáveis.
- A cadeia de chamada das 59 funções de A2 não foi percorrida até o fim: a lista é o **inventário da
  superfície**, e cada item exige confirmação individual antes de qualquer revogação, para não
  quebrar triggers e fluxos legítimos.
- Contagens agregadas apenas; nenhuma linha de dado pessoal ou financeiro foi lida ou registrada.

## 5. Próxima etapa (preparada, não executada)

Ver também `docs/security/d1-achado-a7-conta-do-lancamento.md` (achado A7, registrado separadamente).

`docs/security/d1/d1-teste-isolamento-homologacao.sql` traz o roteiro controlado para **homologação**,
com duas empresas e dois usuários fictícios, cobrindo: positivos do próprio tenant; negativos cruzados
em SELECT/INSERT/UPDATE/DELETE; tentativa de reatribuir `company_id`; FK apontando para linha de outra
empresa; RPCs e views; usuário sem vínculo; e `anon`. O arquivo é idempotente, roda dentro de
transação com `ROLLBACK` e **não deve ser executado em produção**.
