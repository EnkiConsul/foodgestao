# Últimos acessos dos usuários (backoffice)

Nova página no backoffice para acompanhar, em tempo real, o último acesso de cada usuário.

## O que a tela mostra

Uma lista com todos os usuários da plataforma, ordenada do acesso mais recente para o mais antigo:

- Nome
- E-mail
- Telefone
- Empresas vinculadas (nome da empresa e se a pessoa é dona ou convidada)
- Data e hora do último acesso, com o tempo relativo ("há 12 minutos")
- Situação atual: "Online agora", "Ausente" ou "Offline"

Recursos:

- Busca por nome, e-mail, telefone ou empresa
- Cartões de resumo no topo: online agora, acessos hoje, acessos nos últimos 7 dias, total de usuários
- Filtro rápido: todos / online agora / sem acesso nos últimos 30 dias
- Botão de atualizar, com indicação de "atualizado há X"
- Layout em tabela no desktop e em cartões no celular

## Como o "tempo real" funciona

Duas fontes combinadas:

1. Quem está conectado neste instante vem do mesmo canal de presença já usado na tela "Usuários Conectados" — muda na hora, sem recarregar.
2. A data/hora do último acesso e os dados cadastrais são lidos do backend e atualizados automaticamente a cada 30 segundos (e no botão de atualizar). Quando alguém aparece online, a linha passa a mostrar "agora".

## Detalhes técnicos

- Nova rota `/admin/acessos` com item "Últimos Acessos" na sidebar do backoffice (`AdminSidebar.tsx`), protegida por `SuperAdminRoute` como as demais.
- Nova página `src/pages/admin/Acessos.tsx` + componente `src/components/admin/AdminLastAccess.tsx` seguindo o padrão de `AdminOnlineUsers.tsx` (mesmos cartões, busca, tabela desktop + cartões mobile).
- Reuso da Edge Function `admin-list-users-auth` (já valida super admin via `is_super_admin` e usa service role): estender o retorno com `companies: [{ id, name, role }]` por usuário, montado a partir de `company_members` (join em `companies`) e da coluna `companies.user_id` para identificar donos. Nenhum outro consumidor quebra: o campo é aditivo (`AdminUsers.tsx` ignora).
- Último acesso vem de `auth.last_sign_in_at` (já exposto pela função); telefone de `profiles.phone` com fallback `auth.phone`; e-mail de `auth.email`.
- Presença ao vivo via `useOnlineUsers()` (`src/hooks/usePresence.tsx`), casada por `user_id`; sem novo canal, sem novas inscrições.
- Hook de dados com React Query (`refetchInterval` de 30s) na própria página, sem alterar hooks existentes.

## Validação

- Conferir que a lista traz todos os usuários, com data/hora do último acesso e empresas corretas.
- Abrir a plataforma em outra sessão e confirmar que a pessoa passa a "Online agora" sem recarregar.
- Confirmar que usuário sem permissão de backoffice continua sem acesso à rota.
