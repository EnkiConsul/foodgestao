# Remover o módulo Pedidos 360° (completo)

Remoção total: telas, loja online pública, integrações, funções de backend e dados. Verificado no banco: 0 pedidos registrados, 2 unidades e 4 produtos cadastrados (dados de teste), 3 empresas com o módulo Pedidos habilitado.

## O que sai do app

- Rotas `/pedidos`, `/pedidos/*` e a loja pública `/c/:slug`.
- Páginas do módulo (início, onboarding, central, cozinha, expedição, cardápio, relatórios, integrações, assinatura) e as páginas da loja online.
- Componentes de Pedidos e da vitrine, hooks de pedidos/loja, biblioteca de regras de pedidos e o menu lateral "Pedidos 360°".
- Pedidos deixa de aparecer no Hub, no seletor de módulos, no menu mobile, nas permissões por usuário e no backoffice de módulos.
- Banner/atalhos de trial de Pedidos e alertas relacionados.

## O que sai do backend

- Tabelas `ped_*` (34 tabelas) com todos os seus dados, além dos tipos de dados exclusivos do módulo.
- Funções de banco do módulo: pedidos, catálogo, mesas, entregas, impressão, integrações, relatórios, loja pública e entitlement/trial de Pedidos.
- Rotinas agendadas do módulo (expiração de trial, filas de integração), se existirem.
- Funções de servidor `orders-inbox-worker`, `orders-outbox-worker`, `orders-integration-receiver` e `storefront-media`.
- Buckets de arquivos `ped-produtos` e `ped-storefront` com as imagens.
- Registro do módulo no catálogo e as habilitações em empresas.

## Ordem de execução

1. Remover código do app (rotas, páginas, componentes, hooks, libs, menus, permissões, backoffice).
2. Excluir as funções de servidor do módulo.
3. Migração de banco: apagar rotinas agendadas, funções, tabelas `ped_*`, tipos, registros de catálogo/habilitação e políticas de arquivos dos buckets.
4. Remover os testes e a documentação do módulo (`orders-*`, `storefront*`, `e2e/storefront-sw-loop.spec.py`, `docs/pedidos-fase10-golive.md`).
5. Rodar testes e checagem de tipos para garantir que nada mais referencia Pedidos.

## Detalhes técnicos

- O valor `pedidos` do enum `app_module` permanece (é usado por histórico e por enums do Postgres não removíveis com segurança), mas deixa de constar em `src/lib/modules.ts`, no Hub e no catálogo — assim não aparece em lugar nenhum da interface.
- `useActiveModule`, `mobileNav`, `AppSidebar`, `src/lib/permissions.ts` e `PermissionsEditor` perdem as entradas de Pedidos.
- Verificação de referências restantes com busca por `pedidos`, `orders`, `ped_` e `storefront` antes de encerrar.

## Aviso

A exclusão dos dados e das tabelas é irreversível. Após aprovação, a migração de exclusão será submetida para sua confirmação antes de rodar.
