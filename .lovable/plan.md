# Correção de segurança: catálogo de módulos visível por completo

## O que está acontecendo

Hoje qualquer pessoa logada consegue ler todo o catálogo de módulos, inclusive os módulos que estão desativados (ainda não lançados ou descontinuados). Isso expõe informação comercial que não deveria circular fora do backoffice.

## O que será feito

- Quem está logado passa a ver apenas os módulos ativos.
- Administradores do sistema continuam vendo o catálogo completo, para poder ativar e desativar módulos no backoffice.
- Nada muda para o usuário comum na prática: o Hub e o onboarding já mostram somente módulos ativos.

## Detalhes técnicos

- Migração substituindo a política de leitura de `public.modulos_catalogo`:
  - `USING (ativo = true OR public.has_role(auth.uid(), 'super_admin'))` para `authenticated`.
  - Sem acesso para `anon`.
- Nenhuma alteração de código de tela: `useModulosCatalogo` já filtra `ativo = true`; `useModulosCatalogoAdmin` é usado só no backoffice por super admin.
- Após aplicar, marcar o finding `modulos_catalogo_authenticated_select_true` como corrigido.
