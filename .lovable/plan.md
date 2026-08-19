# Assinaturas no backoffice: cadastros faltando e nomes em números

## O que está acontecendo

Duas causas distintas, ambas confirmadas no banco.

### 1. Assinaturas que não aparecem

A criação automática de assinatura no cadastro procura o plano com slug `free` **ativo**. Esse plano foi desativado quando os planos passaram a ser Essencial / Gestão / Multiempresa. Como nenhum plano `free` ativo existe, a assinatura simplesmente não é criada e o cadastro nunca aparece na lista.

Efeito: a última assinatura criada é de 15/08/2026. Cadastros posteriores (ex.: Alessandro Fernandes Silva, 17/08, e Murilo de Paula Castro, 18/08) existem como usuários, mas sem assinatura.

### 2. Nomes aparecendo como números

A coluna Cliente mostra o nome do perfil; quando não há perfil, ela cai para os 8 primeiros caracteres do ID do usuário. As linhas "44444444…" e "11111111…" são usuários de teste/seed (IDs fabricados como `11111111-aaaa-…`), sem perfil — por isso nome e sublinha ficam idênticos e parecem "números". Há também linhas de teste automatizado (`e2e-…@example.com`) e contas de portal do colaborador (`cpf########@portal.360food.local`) poluindo a lista.

## Correções propostas

1. **Voltar a criar assinatura para todo novo cadastro**: ajustar a criação automática para escolher o plano de entrada de forma robusta — plano padrão ativo (menor `sort_order`, hoje Essencial) quando não existir `free` ativo —, e nunca deixar o cadastro sem assinatura.
2. **Regularizar os cadastros órfãos**: criar as assinaturas faltantes dos usuários que hoje não têm nenhuma, para que apareçam no backoffice.
3. **Tornar visível quando falta perfil**: na coluna Cliente, exibir "Sem perfil" (com o ID em fonte menor) em vez de repetir o ID como se fosse nome.
4. **Filtrar ruído de teste**: adicionar na tela de Assinaturas um filtro (ligado por padrão) que oculta contas de teste/seed e contas de portal do colaborador, com opção de exibir tudo. Também mostrar a contagem correta considerando o filtro aplicado.
5. **Rótulo do plano**: sinalizar no seletor quando a assinatura aponta para um plano inativo (ex.: "Free (inativo)"), para deixar claro por que várias linhas antigas mostram Free.

## Detalhes técnicos

- Migração: recriar `handle_new_user_subscription` com fallback (`slug = 'free' AND is_active` → senão primeiro plano ativo por `sort_order`) e log/exception segura; backfill das assinaturas ausentes.
- Frontend: `src/components/admin/ClientCell.tsx` (estado "sem perfil"), `src/components/admin/AdminSubscriptions.tsx` (filtro de contas de teste, contagem, rótulo de plano inativo).
- Nenhuma alteração em RLS: as políticas de super admin já liberam leitura de `subscriptions` e `profiles`.
