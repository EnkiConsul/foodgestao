# Telefone obrigatório no cadastro

Hoje o telefone é opcional: não é pedido na criação da conta e pode ficar vazio no perfil. Passa a ser obrigatório.

## O que muda

1. **Criação de conta**: novo campo "Telefone (WhatsApp)" logo abaixo do nome, com máscara brasileira `(00) 00000-0000`. Sem telefone válido a conta não é criada; a mensagem de erro aparece embaixo do campo.
2. **Perfil / Configurações**: o telefone passa a ser obrigatório para salvar, com a mesma máscara e validação. Campo marcado como obrigatório.
3. **Quem já tem conta sem telefone**: ao entrar, um aviso pede o telefone com um campo e o botão "Salvar". O aviso pode ser fechado para não travar o uso, mas volta a aparecer no próximo acesso enquanto o telefone estiver vazio.

Validação usada: 10 ou 11 dígitos, DDD válido, celular começando com 9 — a mesma regra já aplicada em outras telas.

## Detalhes técnicos

- `src/pages/Auth.tsx`: `signupSchema` ganha `phone` com `refine(isValidPhone)`; estado + input com `maskPhone` (`src/lib/phone.ts`); telefone enviado em `signUp` via `options.data.phone` e gravado no perfil.
- `src/hooks/useAuth.tsx`: `signUp` recebe `phone` e o repassa em `options.data` (o trigger de criação de perfil já lê `raw_user_meta_data`; se não copiar `phone`, gravar via update do perfil após o primeiro login — verificar `handle_new_user` antes de escolher).
- `src/pages/Configuracoes.tsx`: validação com `isValidPhone` antes do update, `maskPhone` no `onChange`, label com asterisco e erro inline; bloqueia o `mutate` quando inválido.
- `src/lib/validations.ts`: novo `profileSchema` (nome + telefone obrigatório) usado por Configurações, via `validateWithToast`.
- Aviso para contas antigas: componente `src/components/profile/PhoneRequiredBanner.tsx` renderizado no layout principal, exibido quando `profiles.phone` está vazio; grava direto em `profiles` e invalida a query do perfil. Sem novas tabelas nem migração.
- Empresas, contatos e colaboradores permanecem como estão (fora do escopo).

## Validação

- Criar uma conta sem telefone e confirmar o bloqueio; criar com telefone e conferir o valor no perfil e na tela "Últimos Acessos".
- Tentar salvar Configurações apagando o telefone e confirmar o erro.
- Entrar com um usuário sem telefone e confirmar que o aviso aparece e que salvar resolve.
