## Diagnóstico (verificado)

Rodei os checks no repo antes de planejar:

- `tsconfig.app.json` tem `strict: false`, `noImplicitAny: false`. O passo do CI "TypeScript typecheck (strict)" aponta para ele — **o nome mente, não guarda nada**.
- `tsconfig.strict.json` compila **com 0 erros** hoje (validei com `npx tsc -p tsconfig.strict.json --noEmit`). O trabalho está feito e desprotegido.
- `package.json` tem `"typecheck:strict": "tsgo -p ./tsconfig.strict.json"`. `tsgo` não existe como binário no projeto — o script quebra ao rodar.
- `npx eslint .` retorna **555 problemas: 501 errors + 54 warnings**. Com `--max-warnings=0` o passo sempre falha. A troca sugerida (`--max-warnings=54`) **não resolve sozinha**: `--max-warnings` só limita warnings; os 501 *errors* continuam quebrando o CI. Precisa mexer nas regras também.

Distribuição dos errors:
- 485 `@typescript-eslint/no-explicit-any` — dívida real, muito volume, precisa virar warning para ratchet decrescente
- 5 `prefer-const` — auto-fixáveis
- 11 outros (`no-require-imports`, `no-empty-object-type`, etc.) — pontuais, correção rápida

## O que fazer

### 1. Guardar o ganho do strict no CI
Em `.github/workflows/ci.yml`, trocar o alvo do typecheck:

```yaml
- name: TypeScript typecheck (strict — no errors allowed)
  run: npx tsc -p tsconfig.strict.json --noEmit
```

Assim a primeira PR que introduzir um `null` não tratado ou `any` implícito em `src/lib|hooks|components|pages` é bloqueada.

### 2. Consertar o script `typecheck:strict`
Em `package.json`, trocar `tsgo` por `tsc`:

```json
"typecheck:strict": "tsc -p ./tsconfig.strict.json --noEmit"
```

Assim `npm run typecheck:strict` funciona local e reproduz o CI.

### 3. Destravar o ESLint (ratchet decrescente honesto)

Três passos, na ordem:

a) **Auto-fix dos erros triviais**: rodar `npx eslint . --fix` para resolver os 5 `prefer-const` e ~2 fixáveis extras.

b) **Corrigir os erros pontuais restantes** (~9 casos manuais):
   - `tailwind.config.ts:94` — trocar `require(...)` por `import`
   - `~7` `no-empty-object-type` e outros — ajustes locais

c) **Rebaixar `@typescript-eslint/no-explicit-any` de `error` → `warn`** em `eslint.config.js`. Isso reconhece a dívida como dívida (aparece no output) sem quebrar o CI, e permite baixar o teto ao longo do tempo.

d) **Definir um teto de warnings** no CI igual à nova baseline (a ser medida após passos a–c; estimativa ~539 = 485 + 54). O teto vira uma trava decrescente: qualquer PR que adicione warning quebra; PRs que reduzem podem baixar o número.

```yaml
- name: ESLint (ceiling — must not increase)
  run: npx eslint . --max-warnings=<baseline>
```

### 4. Documentar
Adicionar 3–4 linhas no `README.md` (seção CI) explicando o ratchet: strict TS = zero, ESLint warnings = teto decrescente.

## Detalhes técnicos

- Não vou tocar em regras de `react-hooks/exhaustive-deps` nem `react-refresh` — os 54 warnings atuais já ficam abaixo do teto.
- Não vou fixar `no-explicit-any` em lote (485 casos = risco de regressão silenciosa). O plano é ratchet, não big-bang.
- Escopo do `tsconfig.strict.json` continua o mesmo (`src/lib|hooks|components|pages`, exclui testes). Edge functions e configs ficam fora do strict, dentro do lint.
- O workflow `security-lint.yml` continua independente — este plano não mexe nele.

## Fora de escopo

- Zerar os `no-explicit-any` (será feito em ondas depois, cada PR baixa o teto).
- Habilitar strict no `tsconfig.app.json` inteiro (Fase 2 já foi incremental por diretório; expandir é trabalho novo).

## Resultado esperado

- CI vermelho por motivo real, não por ruído histórico.
- Strict TS trancado: PR que quebra strict é rejeitada.
- ESLint com teto decrescente: dívida visível, sem falso vermelho.
- `npm run typecheck:strict` funciona local.
