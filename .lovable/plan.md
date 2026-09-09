# Donos podem gerenciar outros donos na Gestão de Usuários

## Contexto
Hoje a tela de Gestão de Usuários esconde os botões de editar/remover para qualquer membro com papel "Dono", mas as regras do banco já permitem que um dono altere ou remova outro dono. Decisão registrada: **qualquer dono pode editar papel, permissões e remover outro dono**.

## O que muda para o usuário
- Na Gestão de Usuários, membros com papel "Dono" passam a exibir os botões **Permissões** e **Remover** para quem também é dono — igual já ocorre com admins e membros.
- Um dono continua **sem poder alterar ou remover a si mesmo** (evita deixar a empresa sem nenhum dono por acidente).
- Admins continuam sem ver ações sobre donos — apenas donos gerenciam donos (a interface passa a refletir exatamente o que o banco já permite).

## Alterações técnicas
- `src/pages/GestaoUsuarios.tsx` (desktop e mobile): trocar a condição `member.role !== "owner"` por regra alinhada ao banco:
  - Mostrar ações quando o usuário logado é **dono** da empresa e o membro não é ele próprio.
  - Quando o usuário logado é **admin** (não dono), mostrar ações apenas para membros que não são donos (como hoje).
- Nenhuma mudança de banco necessária: as policies de `company_members` já permitem dono → dono em alterar, remover e convidar novos donos.

## Verificação
- Typecheck (`bunx tsgo --noEmit`).
- Conferência visual no preview em /gestao-usuarios com conta de dono: botões visíveis em outro dono, ocultos no próprio usuário.
