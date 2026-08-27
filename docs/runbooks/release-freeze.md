# Runbook — Congelamento de release (certificação)

## Estado atual

| Campo | Valor |
| --- | --- |
| Congelado | **Sim** |
| SHA congelado (release candidate) | `bcb88435e` — "Validou redirect em Auth.tsx" |
| Início do freeze | 2026-08-27 08:27 UTC (05:27 São Paulo) |
| Responsável | Rafael Castro |
| Motivo | Certificação do release |

A fonte da verdade legível por máquina é `.lovable/release-freeze.json`. O gate de CI
(`.github/workflows/release-freeze-gate.yml`) lê esse arquivo e falha qualquer PR/push
para `main` enquanto `frozen` for `true`, exceto hotfixes aprovados.

## O que NÃO entra durante o freeze

- Nenhuma feature nova.
- Nenhum refactor (inclusive "melhoria de layout" ou renomeações).
- Nenhuma migração de banco de dados.
- Nenhuma alteração de dependências (`package.json` / lockfile).
- Nenhuma mudança em edge functions que não seja hotfix aprovado.

## O que pode entrar

- Correção de bug **bloqueante** encontrado na certificação — uma por vez.
- Documentação e artefatos de certificação (este runbook, checklists, evidências).

## Procedimento de hotfix

1. Registrar o bug na tabela de hotfixes abaixo (sintoma, impacto, quem aprovou).
2. Fazer a **correção mínima** — nada além do necessário para destravar a certificação.
3. Incluir o marcador `hotfix-approved` na mensagem do commit ou no título/label do PR,
   para o gate de CI liberar o merge.
4. Rodar CI completa (`typecheck`, `lint`, `vitest`, build) e repetir os testes de
   certificação afetados pela área alterada.
5. Atualizar `.lovable/release-freeze.json` (`sha`) e a tabela abaixo com o novo SHA
   congelado.

### Hotfixes aplicados durante o freeze

| Data | SHA | Bug corrigido | Aprovado por | Testes repetidos |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

## Pedidos adiados (pós-freeze)

Qualquer pedido de feature ou refactor durante o freeze é registrado aqui em vez de
implementado.

| Data | Pedido | Observação |
| --- | --- | --- |
| — | — | — |

## Descongelamento

1. Confirmar com o responsável que a certificação foi concluída.
2. Em `.lovable/release-freeze.json`, definir `frozen: false` e registrar `ended_at`.
3. Atualizar o "Estado atual" deste runbook para **Não congelado**, mantendo o histórico
   de hotfixes.
4. Retomar a fila de "Pedidos adiados".

## Observação

O gate de CI não substitui a proteção de branch no provedor Git (não configurável pelo
agente). Marque o job `release-freeze-gate` como check obrigatório em `main` para que o
freeze realmente bloqueie merges.
