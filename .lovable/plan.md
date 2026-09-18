# Senha forte no cadastro e na troca de senha

## O que muda para o usuário

Ao criar uma conta nova, a senha passa a exigir:

- pelo menos 8 caracteres (sem teto baixo — senhas longas são aceitas);
- ao menos 1 letra maiúscula;
- ao menos 1 letra minúscula;
- ao menos 1 número;
- ao menos 1 caractere especial (como ! @ # *).

A mesma regra vale ao redefinir a senha pelo link de recuperação. A tela de primeiro acesso do colaborador já segue essa regra e fica igual, sem mudança.

Enquanto a pessoa digita, aparece uma lista curta de requisitos marcando o que já foi atendido e o que falta, em português, e o botão de criar conta só funciona quando todos estão atendidos.

## Onde aparece

- Tela de entrada/cadastro (aba "Criar conta").
- Tela de redefinir senha (link recebido por e-mail).
- Primeiro acesso do colaborador: mantém o comportamento atual (já exige o mesmo).

## Detalhes técnicos

- Criar `src/lib/senhaForte.ts`: schema Zod reutilizável (`min(8)`, `max(128)`, regex de maiúscula, minúscula, número e símbolo) com mensagens PT-BR, mais um helper `requisitosSenha(valor)` que devolve a lista de requisitos com atendido/não atendido.
- `src/pages/Auth.tsx`: substituir `password: z.string().min(6, ...)` do schema de cadastro por esse schema; o schema de login **não muda** (contas antigas com senha curta seguem entrando).
- `src/pages/ResetPassword.tsx`: mesmo schema no lugar do `min(6)`.
- `src/pages/PrimeiroAcesso.tsx`: passar a importar o schema compartilhado, mantendo as regras atuais (só remove a duplicação).
- Componente pequeno de lista de requisitos, exibido sob o campo de senha nessas telas, usando tokens semânticos do design system.
- O servidor (Auth do backend) já recusa senhas fracas nas funções de senha do colaborador; nada de migration nem mudança de banco.

## Verificação

Typecheck, lint dos arquivos alterados, testes já existentes e uma passagem rápida no navegador (celular e desktop) nas telas de cadastro e redefinição. Nada publicado.
