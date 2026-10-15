# Runbook — Publicação, versões e rollback (Plano 04)

Diagnóstico de 2026-10-15. Documento somente de processo: não altera código,
banco, Storage, permissões nem configuração de publicação.

## 1. Fluxo real

```text
Editor Lovable ──commit automático──▶ main (repositório Git do Lovable) ──sync──▶ GitHub
       │                                         │
       │                                         └─▶ GitHub Actions (CI, Release Gate,
       │                                              Freeze Gate) — só SINALIZAM
       └─▶ Preview (id-preview--…) build automático a cada commit
       └─▶ Botão "Publicar/Atualizar" (manual) ──▶ aveto360.com / aveto360.lovable.app
```

Evidências:
- Remote `origin` é o Git interno do Lovable; o Lovable grava direto na `main`
  (sem Pull Request). O GitHub recebe por sincronização bidirecional.
- Publicação do frontend é **manual** (botão Publicar no Lovable). Não há outro
  serviço de hospedagem nem deploy configurado no repositório.
- **Backend (migrations e funções do servidor) entra em vigor imediatamente**, sem
  passar pelo botão Publicar — o banco é um só para preview e produção.
- O Lovable não consulta o GitHub Actions antes de publicar.

## 2. Respostas às perguntas de eficácia

| Pergunta | Resposta | Evidência |
| --- | --- | --- |
| Commit entra na `main` com CI reprovado? | **Sim** | Lovable grava direto na `main`; CI roda depois (`on: push`). Proteção de branch não foi verificável daqui — NÃO COMPROVADO, mas o fluxo Lovable não passa por PR. |
| Commit com Release Gate reprovado pode ser publicado? | **Sim** | Publicar é ação manual no Lovable, sem leitura de status do GitHub. Último relatório local (`reports/release-gate.json`, 2026-09-15) tem etapas `failed` e `skipped`. |
| Release Freeze Gate impede alterações? | **Não, só sinaliza** | Falha o job após o push; não reverte nem bloqueia publicação. Hoje `frozen: false`. |
| Algo impede publicação quando checks falham? | **Não existe** | Nenhum vínculo entre Actions e o botão Publicar. |
| Como recuperar versão estável? | Histórico de versões do Lovable (restaurar) ou `git revert` + nova publicação | Ver seção 6. |

## 3. Quatro estados de uma versão

| Estado | Definição | Como comprovar |
| --- | --- | --- |
| Sincronizado | Commit na `main` | `git log origin/main` |
| Validado | Passou nas verificações **efetivamente executadas** | Run do GitHub Actions do SHA ou `reports/release-gate.json` com `ranAt` e SHA |
| Apto para publicação | Checklist da seção 5 completo, sem REPROVADO nos obrigatórios | Checklist preenchido com SHA |
| Publicado | Servido em aveto360.com | `https://aveto360.com/build-env.json` (`build_id`, `built_at`) |

Build OK ≠ validado. Freeze Gate verde ≠ Release Gate verde.

Status de verificação: **APROVADO** (rodou e passou), **REPROVADO** (rodou e
falhou), **NÃO EXECUTADO** (não rodou ou faltou credencial — nunca conta como aprovado).

## 4. Versão em produção hoje

- `build-env.json` publicado: `app_env=producao`, `built_at=2026-10-14T21:26:33Z`.
- O arquivo **não contém o SHA do commit**. Commit mais próximo anterior:
  `3c7c55db4` (21:24:51Z) — correspondência **NÃO COMPROVADA**.
- Branch `_agent-publish` (`8afff0cc6`, 2026-10-03) é marcador interno antigo,
  não reflete a publicação atual.
- Preview: `49de7f500` (in sync). Há commits sincronizados ainda **não publicados**.

Para registrar a versão publicada daqui em diante: no momento de clicar
Publicar, anotar o SHA da `main` e o `build_id` na tabela abaixo.

| Data | SHA publicado | build_id | Checklist | Responsável |
| --- | --- | --- | --- | --- |
| 2026-10-14 | NÃO COMPROVADO (provável `3c7c55db4`) | c2b8a9c7-… | não preenchido | — |

## 5. Checklist de liberação

Preencher cada item com APROVADO / REPROVADO / NÃO EXECUTADO + evidência.

**Integridade técnica**
- [ ] TypeScript (app e strict) — `npm run release:gate -- --only=typescript`
- [ ] ESLint dentro do teto
- [ ] Build de produção
- [ ] Deno check (se mudou função do servidor)
- [ ] Migrations check (se houve migration)

**Segurança**
- [ ] Security Lint e Policy Sweep (exigem conexão de homologação — hoje NÃO EXECUTADO)
- [ ] Isolamento multiempresa (tenancy, homologação — hoje NÃO EXECUTADO)
- [ ] Nenhum segredo exposto

**Preservação funcional (manual, no preview)**
- [ ] Login e acesso
- [ ] Portal do Colaborador abre
- [ ] Visualização e download de documento/contracheque
- [ ] Ficha do colaborador consultável
- [ ] Fluxos tocados pela alteração

**Recuperação**
- [ ] SHA da versão anterior publicada anotado
- [ ] Houve migration/mudança de dados? (sim → rollback de frontend não basta)
- [ ] Impacto em Storage conhecido

Regra: qualquer REPROVADO nos obrigatórios = **não apto**. NÃO EXECUTADO precisa
de justificativa escrita de quem publica.

## 6. Rollback

**Frontend (seguro):**
1. Lovable → histórico de versões → restaurar a versão anterior; ou
   `git revert <sha>` na `main`.
2. Clicar Publicar/Atualizar.
3. Conferir `build-env.json` (`built_at` novo) e repetir o checklist funcional.

**Limites (não é recuperação completa):**
- Restaurar código **não desfaz** migrations, dados gravados nem arquivos no Storage.
- Se a versão nova aplicou migration, o frontend antigo pode ficar incompatível
  com o schema atual — avaliar antes; reverter banco exige migration nova aprovada
  (rollbacks prontos em `docs/runbooks/rollback/`).
- Nunca excluir dados ou documentos para "voltar" uma versão.

## 7. Pendências que exigem aprovação

1. Gravar o SHA do commit em `build-env.json` (alteração de `vite.config.ts`) —
   tornaria a versão publicada comprovável.
2. Credenciais de homologação no GitHub para Security Lint/tenancy executarem.
3. Proteção de branch na `main` — **não recomendada** sem estudo: o Lovable grava
   direto e poderia quebrar a sincronização.
4. Corrigir falhas preexistentes (strict 128 erros, ESLint, migrations check).
