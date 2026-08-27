# Congelamento de release para a certificação

Objetivo: fixar um SHA como candidato de release, documentá-lo e impedir mudanças acidentais em `main` enquanto a certificação estiver em andamento.

## SHA candidato

O commit mais recente de `main` é `bcb88435e` ("Validou redirect em Auth.tsx"). Ele será registrado como o SHA congelado (`RELEASE_CANDIDATE`).

## O que será criado

1. `docs/runbooks/release-freeze.md` — runbook do congelamento:
   - SHA congelado e data/hora de início do freeze;
   - o que pode e o que não pode entrar durante o freeze (nenhuma feature, nenhum refactor, nenhuma migração de banco);
   - procedimento de hotfix: correção mínima, aprovação explícita do responsável, atualização do SHA congelado no arquivo e nova rodada dos testes de certificação afetados;
   - procedimento de descongelamento (encerrada a certificação, remover o marcador de freeze).

2. `.lovable/release-freeze.json` — marcador legível por máquina com `frozen: true`, `sha`, `started_at`, `owner`, `reason`. É a fonte única que o gate de CI consulta.

3. `.github/workflows/release-freeze-gate.yml` — job que roda em `pull_request` e `push` para `main`:
   - se `frozen` é `true` e o PR/push não tem o label/marcador `hotfix-approved` na mensagem, o job falha com uma mensagem clara ("main congelada no SHA X — só hotfixes aprovados");
   - imprime o SHA congelado versus o SHA atual, para deixar visível qualquer divergência.

## Regra de trabalho durante o freeze

Enquanto `.lovable/release-freeze.json` estiver com `frozen: true`, eu não faço alterações em código de produto. Aceito somente:
- correções de bug bloqueantes encontradas na certificação, uma por vez, com registro no runbook;
- edições em documentação e nos artefatos de certificação.

Qualquer pedido de nova feature durante esse período eu registro na lista de pós-freeze do runbook em vez de implementar.

## Notas técnicas

O gate não substitui proteção de branch no provedor Git (que não é configurável daqui); ele falha o CI, o que já impede merge quando o check é obrigatório. A regra do freeze também será salva na memória do projeto para valer em sessões futuras até ser removida.
