## Análise

Três achados confirmados:

**1. Furos no strict** — `tsconfig.strict.json` inclui só `src/lib`, `src/hooks`, `src/components`, `src/pages` + `vite-env.d.ts`. Ficam de fora:
- `src/main.tsx` — entrypoint (uso de `document.getElementById("root")!` já com non-null assert, mas fora do gate).
- `src/App.tsx` — roteamento + guards.
- `src/routes/onboardingGuards.tsx` — decisões de fluxo pós-login.
- `src/integrations/supabase/client.ts` — auto-gerado, mas é o portal por onde entra todo dado potencialmente `null` no app. Sem checagem strict aqui, o benefício em `src/lib` fica furado.

**2. Teto ESLint colado em 546** — comportamento desejado para ratchet, mas sem folga. Precisa estar documentado para o time não interpretar vermelho como flakiness.

**3. Comentário desatualizado** — `ci.yml` diz "Baseline: 546 warnings (out/2026)", estamos em julho/2026.

## Correções

**A. Expandir `tsconfig.strict.json`**
Adicionar ao `include`:
```
"src/main.tsx",
"src/App.tsx",
"src/routes/**/*.ts",
"src/routes/**/*.tsx",
"src/integrations/**/*.ts"
```
Após adicionar, rodar `tsc -p tsconfig.strict.json --noEmit` e corrigir erros que aparecerem. Expectativa:
- `main.tsx` — provavelmente 0 erros (já usa `!`).
- `App.tsx` — pode ter alguns por `useState<boolean|null>` e handlers RPC (`data` possivelmente null).
- `onboardingGuards.tsx` — precisa ser lido; provável passar limpo pois já vive em contexto strict-adjacente.
- `supabase/client.ts` — auto-gerado, não editável. Se der erro, incluímos e resolvemos via type-augmentation em arquivo próprio (nunca editar o gerado).

Se algum arquivo tiver mais que ~5 erros bobos, corrigimos na mesma PR. Se for volumoso, plano é: incluir mesmo assim e abrir apenas os que passam limpos primeiro (`main.tsx`, `onboardingGuards.tsx`, `integrations/**`), deixando `App.tsx` para uma segunda passada anotada como TODO no arquivo do ratchet.

**B. Documentar o ratchet no `README.md`**
Adicionar aviso curto na seção CI: "Teto colado por design. `any` novo = build vermelho — isso não é flakiness, é o ratchet funcionando. Para adicionar dívida técnica justificada, reduza a dívida em outro lugar na mesma PR e mantenha o teto."

**C. Corrigir comentário no `ci.yml`**
`out/2026` → `jul/2026`.

## Ordem de execução

1. Ler `src/App.tsx`, `src/routes/onboardingGuards.tsx`, `src/integrations/supabase/client.ts` para dimensionar erros.
2. Expandir `include` do `tsconfig.strict.json`.
3. Rodar typecheck strict; corrigir o que aparecer (não editar arquivos auto-gerados).
4. Atualizar comentário do `ci.yml` e adicionar nota no `README.md`.
5. Rodar CI local (`tsc strict` + `eslint --max-warnings=546`) para validar verde.

## Fora de escopo

- Não baixar o teto de 546 agora (é trabalho separado, PR-a-PR).
- Não editar `src/integrations/supabase/client.ts` nem `types.ts` (auto-gerados).
