# Recrutamento 360 — Preservação antes da separação

Decisão: o Recrutamento 360 sai do AVETO 360 e será reconstruído como produto independente (Lovable + backend próprio).
Esta pasta é **somente documentação** (Fase 1.1). Nenhuma funcionalidade foi desativada.

## Referência preservada
- Repositório: `EnkiConsul/foodgestao`
- SHA preservado: `84593beb8f1c9d9636bf259c63cd9c42ec45a85f`
- Link do commit: https://github.com/EnkiConsul/foodgestao/commit/84593beb8f1c9d9636bf259c63cd9c42ec45a85f
- Tag planejada: `recrutamento-360-pre-separacao-2026-10-20`
  - Link (válido após a criação): https://github.com/EnkiConsul/foodgestao/releases/tag/recrutamento-360-pre-separacao-2026-10-20
  - Situação em 20/10/2026: **tag NÃO criada** — o ambiente de desenvolvimento não tem permissão de escrita no GitHub. Ver "Como criar a tag".

## Como criar a tag (dono do repositório)
Pelo GitHub: Releases → Draft a new release → Choose a tag → digitar `recrutamento-360-pre-separacao-2026-10-20` → Target: **Recent commits** → selecionar `84593be` → Publish.
Pela linha de comando:
```
git fetch origin
git tag -a recrutamento-360-pre-separacao-2026-10-20 84593beb8f1c9d9636bf259c63cd9c42ec45a85f -m "Recrutamento 360 antes da separacao"
git push origin recrutamento-360-pre-separacao-2026-10-20
git ls-remote origin refs/tags/recrutamento-360-pre-separacao-2026-10-20   # comprova
```
Opcional: Settings → Rules → Rulesets → proteger tags `recrutamento-360-*` contra exclusão/alteração.

## Como recuperar o código
```
git clone https://github.com/EnkiConsul/foodgestao.git
cd foodgestao
git checkout recrutamento-360-pre-separacao-2026-10-20   # ou o SHA acima
```
Arquivos do módulo: ver `inventario-tecnico.md`. Sem a tag, o SHA continua recuperável enquanto fizer parte do histórico da `main` (não fazer force-push/reescrita de histórico).

## Importante
- Preservação de código **não substitui backup do banco**. Dados (candidatos, avaliações, consentimentos) ficam só no banco de produção.
- Nenhum dado pessoal, OTP, token ou segredo está nesta pasta.

## Documentos
- `inventario-tecnico.md`, `regras-de-negocio.md`, `arquitetura-e-dependencias.md`, `pendencias-e-seguranca.md`, `plano-de-separacao.md`, `guia-novo-projeto.md`.

## Rollback desta fase
Apagar a pasta `docs/recrutamento-360-encerramento/`. Não há migrations, dados ou código funcional envolvidos.
