# Runbook — build de homologação (banco exclusivo)

Banco exclusivo de homologação: **`utjhzpdbqzajrhnzcher`**
Endpoint exato exigido: **`https://utjhzpdbqzajrhnzcher.supabase.co`**
Produção (`grtxmbffgmgnkawlvqhm`) permanece intocada: `.env`, `supabase/config.toml`
e a conexão do Cloud não foram alterados.

## 1. Variáveis obrigatórias

Arquivo **`.env.homologacao`** na raiz (modelo em `.env.homologacao.example`):

| Variável | Valor exigido |
|---|---|
| `VITE_APP_ENV` | `homologacao` (exato) |
| `VITE_SUPABASE_URL` | `https://utjhzpdbqzajrhnzcher.supabase.co` (exato) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publicável (anon) **do projeto de homologação** |
| `VITE_SUPABASE_PROJECT_ID` | `utjhzpdbqzajrhnzcher` (opcional; se presente precisa bater) |

A chave publicável é obtida no painel do projeto de homologação (Project Settings → API).
Não copie nenhuma chave de produção. O `service_role` nunca entra no frontend.

## 2. Comandos

```bash
npm run hom:check      # valida .env.homologacao (não imprime valores)
npm run dev:hom        # desenvolvimento apontando para homologação
npm run build:hom      # build de homologação (dist/)
npm run preview:hom    # serve o build gerado
```

Produção segue com `npm run dev` / `npm run build`, sem nenhuma mudança.

## 3. Garantias fail-closed

1. `src/bootstrap/ambiente.ts` é o **primeiro** módulo avaliado por `main.tsx`,
   antes de `src/integrations/supabase/client.ts` criar o cliente.
2. `resolverAmbiente` (`src/lib/env/appEnv.ts`) recusa e impede o app de subir quando:
   URL ausente/fora de padrão, chave inválida, `project_id` divergente, flag inválida,
   flag de homologação com banco de produção, banco de homologação **sem** a flag, ou
   banco desconhecido. Não há fallback.
3. `validarChavePublica` (mesma regra em `scripts/check-hom-env.mjs`) aceita **somente**
   chave publicável:
   - formato moderno: apenas prefixo `sb_publishable_`; qualquer outro `sb_*`
     (inclusive `sb_secret_`) é recusado como `chave_nao_publicavel`;
   - formato JWT: o payload é **lido** (base64url) e precisa ter `role: "anon"` e `ref`
     igual ao ref da URL. Isso é leitura de conteúdo, **não** verificação criptográfica
     de assinatura — serve para barrar `service_role` e chave de outro projeto.
4. Tarja permanente "Ambiente de homologação" (`AmbienteBanner`), invisível em produção.
5. O bloqueio de funções vive na **guarda de transporte** (`src/lib/env/homologacaoFetchGuard.ts`),
   instalada no `fetch` global pelo bootstrap **antes** de qualquer cliente do banco existir.
   Motivo técnico: no SDK real, `SupabaseClient.functions` é um *getter* que devolve uma
   instância **nova** de `FunctionsClient` a cada acesso
   (`node_modules/@supabase/supabase-js/src/SupabaseClient.ts`), portanto substituir
   `cliente.functions.invoke` altera só um objeto descartável e a chamada seguinte iria
   para a rede. A guarda intercepta as URLs `/functions/v1/<nome>` com **allowlist e
   negação padrão**:
   - **Liberadas** apenas as funções internas aprovadas, que são as existentes no ref de
     homologação: `dp-refresh-pendencias`, `dp-sorteio-folgas`, `dp-preadmissao-gestor`,
     `dp-preadmissao-publica`, `dp-preadmissao-arquivo`, `dp-doc-bulk-approve`,
     `dp-doc-bulk-discard`, `dp-bloquear-acesso-colaborador`, `auth-config`.
   - `check-onboarding-cnpj` **também está liberada**: ela foi instalada no ref de
     homologação (agora 6 edge functions lá), com guard de URL exata e verificação de
     JWT via `getClaims` (chamada sem JWT responde 401). Não é replicada nem simulada.
   - **Simulada sem rede:** apenas `lookup-cnpj` — não existe no ref de homologação e
     consultaria a BrasilAPI.
   - **Bloqueado tudo o mais, por padrão** — nome desconhecido também falha. Isso cobre
     pagamentos, Open Finance, IA, e-mail/WhatsApp, convites e qualquer função nova.
   Prova em teste: `createClient` **real** do SDK com `fetch` espião — dois acessos
   separados a `cliente.functions.invoke` (`lookup-cnpj` e nome desconhecido) resultam em
   **zero** chamadas de rede; função aprovada chega ao transporte.
6. Envio nativo de e-mail bloqueado em homologação em **duas camadas**: no transporte
   (`/auth/v1/signup`, `/recover`, `/resend`, `/otp`, `/invite`, `/magiclink` e
   `PUT /auth/v1/user` com `email`) e nos métodos do cliente (`signUp`, `resend`,
   `resetPasswordForEmail`, `signInWithOtp`, `reauthenticate`, `updateUser({ email })`). Login por senha com as fixtures A–D segue funcionando.
7. CEP (`consultarCep`) responde por fixture em homologação — ViaCEP não é chamado.
8. O modo `homologacao` **não cai para produção**: `vite.config.ts` carrega
   `.env.homologacao` por cima das variáveis do shell (que são as de produção) e
   **aborta o build** se o resultado não for exatamente a flag + o banco de homologação.
9. `vite build` grava `dist/build-env.json` (`app_env`, `supabase_ref`, `build_id`,
   `built_at`). `scripts/run-e2e.mjs` valida o **DESTINO**, não a máquina:
   - o marcador é lido **por HTTP** em `new URL("/build-env.json", E2E_BASE_URL)`, com
     timeout de 10 s e **sem seguir redirecionamento** (`--max-redirs 0`, além de conferir
     que a URL efetiva é a solicitada);
   - exige `app_env = "homologacao"`, `supabase_ref = utjhzpdbqzajrhnzcher` e `build_id`
     presente, **do próprio servidor alvo**;
   - **hosts de produção são recusados explicitamente** (`aveto360.com`,
     `www.aveto360.com`, `aveto360.lovable.app`, `grtxmbffgmgnkawlvqhm.supabase.co`),
     mesmo que exista marcador local de homologação;
   - `E2E_BUILD_MANIFEST` deixou de ser prova: quando informado, serve só para conferir
     que o `build_id` local é igual ao servido no alvo;
   - nenhum spec roda antes dessa validação; `localhost` não é prova por si só.
10. Produção não ganhou CNPJ mágico, parâmetro de URL nem qualquer bypass: os mocks
    só existem sob `isHomologacao()`, que exige o banco de homologação.

## 4. Regra crítica — não reaplicar migrations históricas em homologação

O banco de homologação **já está provisionado** (catálogo bootstrapped, ~216 tabelas,
usuários de teste A–D e fixtures existentes). Portanto:

- **Proibido** rodar `supabase db push`, `npm run db:migrate` ou qualquer reaplicação
  do histórico de `supabase/migrations` contra `utjhzpdbqzajrhnzcher`. Reaplicar
  destrói/duplica objetos e derruba as fixtures já usadas nos testes.
- **Proibido** recriar os usuários A–D e as empresas de teste. Qualquer script de
  semeadura precisa ser idempotente e só complementar o que faltar.
- Mudanças de schema em homologação, quando necessárias, entram como migration
  **nova e incremental**, aplicada isoladamente e apenas após autorização.
- Paridade de schema se verifica por **leitura** (comparar catálogo hom × prod),
  nunca por reaplicação.

## 5. Instalação de dependências

O repositório tem `bun.lockb` como lock oficial; o `package-lock.json` está
desatualizado e `npm ci` falha por isso. Para validar o commit em worktree local:

```bash
bun install --frozen-lockfile
```

Use `bun run <script>` (ou `npx` direto) no lugar de `npm ci`. Não regenere nem
"conserte" o `package-lock.json` sem pedido explícito.

## 6. Itens pendentes fora deste escopo

Não foram executados (exigem credenciais/decisão no projeto de homologação):

1. Publicar/atualizar as funções no ref de homologação:
   `supabase functions deploy --project-ref utjhzpdbqzajrhnzcher`. O `project_id` em
   `supabase/config.toml` é o padrão quando nenhum alvo é informado — ele **não**
   determina o destino quando `--project-ref` (ou um projeto linkado/`SUPABASE_DB_URL`)
   é passado explicitamente. Ainda assim, não edite o `config.toml`.
2. Segredos próprios nesse projeto — Asaas **sandbox**, Pluggy **sandbox**, e-mail em
   modo teste. **Não inspecionados** neste escopo: o relatório não afirma se existem ou
   não. Enquanto não estiverem configurados, o bloqueio do item 3.4 mantém o
   comportamento seguro (falha explícita em vez de chamada real).
3. Conferir agenda de crons (`expire-trials` etc.) no projeto de homologação.
4. `scripts/seed-staging.mjs` é citado em `scripts/preflight-secrets.mjs` e não existe
   no repositório. Se for criado, deve ser **idempotente** e reaproveitar os usuários
   A–D e as fixtures já presentes, sem recriar nada.
5. E2E: o alvo padrão continua `http://localhost:8080`, mas agora a execução só começa
   com o marcador de build de homologação (item 3.9). Gere `build:hom` e rode
   `E2E_BASE_URL=<preview:hom> E2E_BUILD_MANIFEST=dist/build-env.json bun run e2e`.

Nenhuma URL hospedada foi inventada, nenhum projeto pago foi criado e nenhum deploy de
produção foi feito.
