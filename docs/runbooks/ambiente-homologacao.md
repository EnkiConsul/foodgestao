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
   URL ausente/fora de padrão, chave publicável ausente/malformada, `project_id`
   divergente, flag inválida, flag de homologação com banco de produção,
   banco de homologação **sem** a flag, ou banco desconhecido. Não há fallback.
3. Tarja permanente "Ambiente de homologação" (`AmbienteBanner`), invisível em produção.
4. Em homologação, `supabase.functions.invoke` é interceptado uma única vez
   (`src/lib/env/homologacaoRuntime.ts`):
   - **Simulado sem rede:** `lookup-cnpj` → fixture determinística fictícia.
   - **Bloqueado (erro imediato):** `asaas-*`, `pluggy-*`, `ai-*`,
     `inspect-search-console`, `dp-send-broadcast`, `admin-resend-confirmation`,
     `auth-recovery-request`, `auth-email-hook`, `sync-extra-companies`, `validate-coupon`.
   - **Liberado:** funções próprias da plataforma (`check-onboarding-cnpj`, `auth-login`,
     `accept-invite`, rotinas de Pessoas 360°), que só falam com o banco de homologação.
5. CEP (`consultarCep`) responde por fixture em homologação — ViaCEP não é chamado.
6. Produção não ganhou CNPJ mágico, parâmetro de URL nem qualquer bypass: os mocks
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
5. E2E (`npm run e2e` / `bun run e2e`) continuam mirando `http://localhost:8080`;
   rode-os apenas com `dev:hom` ativo, ou contra o `preview:hom`.

Nenhuma URL hospedada foi inventada, nenhum projeto pago foi criado e nenhum deploy de
produção foi feito.
