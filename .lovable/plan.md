## Objetivo

Adicionar um guardrail permanente no CI que falhe caso alguém commit uma variável **sem prefixo `VITE_`** no `.env` versionado (ou o `.env` volte a ser rastreado com segredos reais tipo `ASAAS_API_KEY`, `PLUGGY_CLIENT_SECRET`, etc.).

## Onde

Arquivo único: `.github/workflows/ci.yml`, dentro do job `quality`, como um novo step antes do typecheck (falha rápido e barato, sem depender de `npm ci`).

## O que adicionar

Um step que:

1. Verifica se `.env` está versionado (`git ls-files --error-unmatch .env`).
2. Se estiver, lê apenas linhas de atribuição (`^[A-Za-z_][A-Za-z0-9_]*=`), ignora comentários/linhas em branco, e falha se **qualquer** chave não começar com `VITE_`.

### Observação técnica (correção do snippet original)

O pipeline proposto pelo revisor tem um bug: `grep -qE '...' .env | grep -qv '^VITE_'` — o primeiro `grep -q` suprime a saída, então o segundo `grep` nunca recebe nada e o guard **nunca dispara**. A versão que vou usar corrige isso:

```yaml
- name: Guard — nenhum segredo não-VITE_ no .env versionado
  run: |
    if git ls-files --error-unmatch .env >/dev/null 2>&1; then
      offenders=$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | grep -Ev '^VITE_' || true)
      if [ -n "$offenders" ]; then
        echo "::error::Variável não-VITE_ detectada no .env versionado:"
        echo "$offenders" | sed 's/=.*/=***/'
        exit 1
      fi
    fi
```

Detalhes:
- `|| true` evita que o `grep` sem matches (exit 1) derrube o step por engano.
- A saída mascara o valor após `=` para não vazar conteúdo em log público caso alguém já tenha commitado um segredo.
- Roda antes do `Install dependencies` para dar feedback em ~5 segundos.

## Não incluído

- Não mexer em `.env`, `.env.example` nem em `.gitignore` (já tratados na fase anterior).
- Não adicionar scan de histórico git (fora de escopo — trufflehog/gitleaks seria outro workflow).
- Não alterar os demais steps do `ci.yml`.

## Validação

Como o step só existe no CI, a validação real acontece no push. Antes disso, dá para rodar manualmente o bloco `run:` no shell local para confirmar que:
- passa quando `.env` não está versionado;
- passa com apenas `VITE_*`;
- falha ao adicionar uma linha `ASAAS_API_KEY=foo`.
