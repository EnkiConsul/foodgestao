# Melhorar mensagem e design do "Restaurar Modelo" em Contas Contábeis

## O que muda

Hoje o botão **Restaurar Modelo** em `/contas-contabeis` dispara um `confirm()` nativo do navegador com o texto seco:

> "Isto irá adicionar as contas do modelo padrão que ainda não existirem nesta empresa. Contas atuais serão mantidas. Continuar?"

Será substituído por um diálogo `AlertDialog` do próprio design system do projeto, com:

- Título claro: **"Restaurar modelo padrão?"**.
- Mensagem mais didática em bullets:
  - Adiciona apenas as contas padrão que ainda faltam no plano de contas da empresa.
  - Contas já existentes — criadas, editadas ou inativadas — permanecem intactas.
  - Ação reversível manualmente, pois nenhuma conta atual é removida.
- Ícone ilustrativo (`Sparkles` ou `RotateCcw`) no cabeçalho do diálogo, alinhado à marca 360°FOOD (laranja `#EB6119`).
- Rodapé fixo com botões:
  - **Cancelar** (outline, à esquerda).
  - **Restaurar modelo** (primário, à direita), com estado de carregamento enquanto `chart_accounts_restore_default` executa.
- Comportamento responsivo: o diálogo já respeita o `AlertDialogContent` existente (max-w-lg, full-width em telas pequenas), sem scroll horizontal.

## Detalhes técnicos

- Em `src/pages/ContasContabeis.tsx`:
  - Criar estado `restoreOpen` e `setRestoreOpen` para controlar o novo `AlertDialog`.
  - Trocar `confirm(...)` por `setRestoreOpen(true)` no clique de **Restaurar Modelo**.
  - Mover a lógica de chamada RPC `chart_accounts_restore_default` para dentro do callback do botão de confirmação do diálogo.
  - Garantir que o botão **Restaurar Modelo** mantenha o estado `disabled={restoring}` durante a execução.
- Manter a mensagem de sucesso/erro existente via `toast` e o `invalidateQueries` para atualizar a lista.
- Não altera dados, schema, regras de negócio nem APIs. É apenas uma melhoria de UX do fluxo de confirmação.
