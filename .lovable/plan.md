# Acesso por módulo: Conta, administradores e gestores

Hoje o menu de Conta > Usuários existe só no Financeiro/Hub, e quem entra no Pessoas 360° vê todas as telas do módulo. O objetivo é ter a gestão de usuários dentro de cada módulo e permissões por tela para os gestores.

## Regras de acesso

- **Colaborador** (cadastro comum, não sócio): apenas o Portal do Colaborador. Não abre nenhuma tela de gestão.
- **Sócio**: pode ser **Administrador** (acesso total ao módulo) ou **Gestor** (telas escolhidas pelo administrador).
- **Colaborador gestor** (gerente, supervisor e similares): mantém o portal dele e ganha as telas que o administrador liberar.
- Para cada tela o administrador escolhe **Nenhum**, **Leitura** ou **Gravação**.
- Quem concede: Dono, Administrador e o gestor que tiver a tela de Usuários com gravação — e este só concede telas que ele próprio possui, nunca mais do que tem.
- Toda concessão continua passando pela confirmação que já existe hoje (nada é liberado automaticamente pelo cadastro do colaborador).

## Como fica a configuração

Escolha por **grupo de menu** com detalhe opcional: o administrador define Cadastro, Documentos, Rotina, Comunicação, Geral e Conta em um clique, e pode abrir o grupo para ajustar telas específicas. A tela herda o nível do grupo enquanto não for ajustada.

```text
Pessoas 360°
  Cadastro .................. Gravação   [abrir]
      Colaboradores ......... Gravação
      Cargos e Salários ..... Leitura
      Benefícios ............ Nenhum
  Documentos ................ Leitura    [abrir]
  Rotina .................... Gravação   [abrir]
  Comunicação ............... Nenhum     [abrir]
  Geral ..................... Nenhum     [abrir]
  Conta (Usuários) .......... Nenhum     [abrir]
```

## O que muda na tela

1. **Menu de Conta em cada módulo**: no Pessoas 360° entra o grupo Conta (Usuários e Empresas) na barra lateral, no menu Mais e nos cards de início, visível apenas para quem tem a tela de Usuários. O Financeiro continua com o menu atual.
2. **Tela de Usuários por módulo**: a mesma tela ganha abas por módulo contratado (Financeiro, Pessoas e demais). Ao abrir pelo Pessoas, começa na aba Pessoas.
3. **Papel do cadastro**: no cadastro do colaborador, Administrador fica disponível só para sócio; colaborador só pode ser Colaborador ou Gestor, e Gestor abre a escolha das telas.
4. **Telas em leitura**: botões de criar, editar, excluir e importar ficam desativados com o aviso "Você tem acesso somente de leitura a esta tela".
5. **Sem acesso**: a tela não aparece no menu e, se alguém digitar o endereço, vê um aviso de acesso não liberado em vez de dados.

## Detalhes técnicos

- Permissões continuam em `company_members.permissions` (jsonb), agora com chaves por módulo e tela: `dp.cadastro`, `dp.cadastro.colaboradores`, `dp.conta.usuarios`, etc. As chaves do Financeiro atuais seguem válidas (compatibilidade preservada).
- Novo mapa em `src/lib/permissions/modules.ts` derivado de `src/config/dpNavigation.tsx` (grupo → telas → rota), com teste de paridade: toda rota navegável do Pessoas tem chave de permissão.
- Resolução única em `src/lib/permissions.ts`: `resolveScreenLevel(role, permissions, screenKey)` — dono/admin = gravação; tela herda do grupo; ausência = nenhum (fail closed). Espelhada no banco por `private.member_screen_permission(_user, _company, _screen)`, que usa a `private.member_permission` já existente.
- Frontend: `useScreenPermission(screenKey)` + `ScreenGuard` aplicado nas rotas `/dp/*` (exceto `/dp/meu`), e `ReadOnlyProvider` para desativar ações em nível de leitura. Colaborador sem gestão é redirecionado para `/dp/meu`.
- Backend (fail closed, não só interface): nova função `public.tela_permitida(_company_id uuid, _screen text, _nivel text)` usada como guarda nas RPCs de gravação do Pessoas e nas policies de gravação das tabelas por grupo — nesta fase os grupos Cadastro (colaboradores, cargos, unidades, benefícios) e Conta; os demais grupos entram na fase seguinte, mantendo o comportamento atual até lá.
- Concessão limitada: a RPC de gravação de permissões recusa conceder nível maior do que o do próprio concedente e recusa Administrador para quem não é sócio, com registro em auditoria.
- Migration isolada e reversível: chaves padrão para membros existentes (dono/admin = gravação em tudo; membro = o que já tinha), função de permissão por tela e policies do grupo Cadastro. Nenhum dado de colaborador, documento ou histórico é alterado.
- Validação: `bunx vitest run` (inclui testes negativos de leitura/gravação/sem acesso e de concessão acima do próprio nível), `bunx tsgo --noEmit -p tsconfig.app.json`, ESLint e conferência no navegador com um gestor de teste. Nada é publicado.

## Fora desta fase

Aplicar a guarda de gravação no banco para os grupos Documentos, Rotina, Comunicação e Geral — entra na fase seguinte, com o mesmo padrão.
