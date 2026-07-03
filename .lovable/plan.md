## Objetivo

Habilitar o Dependabot do GitHub para monitorar dependências e abrir PRs automaticamente quando houver atualizações — priorizando correções de segurança.

## O que será feito

Criar o arquivo `.github/dependabot.yml` com três ecossistemas monitorados:

1. **npm** (raiz do projeto — `package.json` / `bun.lockb`)
   - Verificação semanal (segunda-feira)
   - Limite de 10 PRs abertos simultaneamente
   - Agrupamento de atualizações minor/patch em um único PR para reduzir ruído
   - Atualizações de segurança sempre abertas individualmente (comportamento padrão)
   - Labels: `dependencies`, `security`

2. **npm** (`supabase/functions` — se houver `package.json` em edge functions no futuro; opcional)
   - Mesma cadência

3. **github-actions** (workflows em `.github/workflows/`)
   - Verificação semanal
   - Mantém as actions de CI atualizadas

## Detalhes técnicos

Arquivo: `.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
    groups:
      minor-and-patch:
        update-types:
          - "minor"
          - "patch"
    commit-message:
      prefix: "chore(deps)"
      include: "scope"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    labels:
      - "ci"
      - "dependencies"
```

## Observações

- Dependabot **security updates** já vem habilitado por padrão em repos GitHub via "Dependabot alerts"; este arquivo adiciona o **version updates** (varredura periódica) e configura o comportamento dos PRs.
- Requer que o repo esteja conectado ao GitHub (já está — projeto usa sync bidirecional).
- Não altera código de aplicação, apenas adiciona um arquivo de configuração.
- Não altera dependências existentes.

## Fora do escopo

- Auto-merge de PRs do Dependabot (pode ser adicionado depois via workflow separado, se desejado).
- Configuração de reviewers/assignees específicos (pode ser ajustado após ver o volume de PRs).
