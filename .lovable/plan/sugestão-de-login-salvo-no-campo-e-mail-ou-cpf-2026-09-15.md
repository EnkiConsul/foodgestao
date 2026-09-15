# Sugestão de login salvo no campo "E-mail ou CPF"

## O problema
Na tela de entrada, o navegador só oferece os dados salvos quando você toca no campo de senha. O campo "E-mail ou CPF" não é reconhecido como campo de usuário porque falta a identificação padrão que os navegadores e gerenciadores de senha usam, e o campo de senha também não está marcado como "senha atual".

## O que será feito
- Marcar o campo "E-mail ou CPF" como campo de usuário/e-mail para que o navegador ofereça os logins salvos ao tocar nele.
- Marcar o campo de senha como "senha atual" na entrada e como "nova senha" no cadastro/confirmação, para o preenchimento vir em par (login + senha).
- Manter o campo de e-mail do cadastro coerente com esse padrão.
- Nenhuma mudança visual, de regras de acesso ou de segurança.

## Detalhes técnicos
Em `src/pages/Auth.tsx`:
- `#identifier`: adicionar `name="username"`, manter `autoComplete="username"` e incluir `inputMode="email"`.
- `#password`: `name="password"` + `autoComplete={isLogin ? "current-password" : "new-password"}`.
- `#confirmPassword`: `name="confirmPassword"` + `autoComplete="new-password"`.
- `#email` (cadastro): `name="email"` + `autoComplete="email"`.
- `<form>` recebe `autoComplete="on"`.

## Verificação
- Conferir no navegador que ao focar o campo "E-mail ou CPF" a lista de logins salvos aparece e que escolher um preenche também a senha.
- Rodar tipos/lint e os testes existentes de autenticação.
