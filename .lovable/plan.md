# Remover botão Backoffice do header

Remover totalmente o atalho visual "Backoffice" do cabeçalho do app. O acesso à área administrativa continua disponível apenas via URL direta (`/admin`), e segue protegido pelo `SuperAdminRoute` — usuários sem o papel `super_admin` continuam sendo redirecionados para `/`.

## O que muda

- O botão "Backoffice" (ícone de escudo + texto) deixa de aparecer no header para qualquer usuário, inclusive super admins.
- Super admins acessam o backoffice digitando `/admin` (ou salvando o link nos favoritos).
- Nenhuma mudança em rotas, permissões de banco ou regras de RLS.

## Detalhes técnicos

- `src/components/layout/AppHeader.tsx`: remover o bloco `{isSuperAdmin && (<Button ...>Backoffice</Button>)}`, o import de `Link`, do ícone `ShieldCheck` e do hook `useSuperAdmin` (que não tem mais uso nesse arquivo).
- `SuperAdminRoute` em `/admin/*` permanece intacto, garantindo que somente super admins consigam abrir as páginas mesmo via URL direta.
- Hook `useSuperAdmin` continua existindo para outros usos potenciais (não é removido).
