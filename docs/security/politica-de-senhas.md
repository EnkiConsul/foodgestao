# Política de senhas (S3)

## Regra única

Fonte: `src/lib/security/passwordPolicy.ts`, espelhada em
`supabase/functions/_shared/password-policy.ts` (o teste
`src/test/unit/passwordPolicy.test.ts` falha se os dois arquivos divergirem).

Vale para **todos os caminhos que definem senha**:

- mínimo de **12** caracteres;
- máximo de **72 bytes** (UTF-8) — limite real do bcrypt usado pelo serviço de
  contas. Acima disso a senha é **recusada com mensagem que fala em bytes**,
  nunca truncada em silêncio (letra acentuada e emoji ocupam mais de 1 byte);
- as **quatro classes** continuam obrigatórias: maiúscula, minúscula, número e
  símbolo. Símbolo é só o conjunto ASCII aceito pelo serviço de contas
  (`!@#$%^&*()_+-=[]{};'\:"|<>?,./` e `~`): **espaço e letra acentuada não
  contam**;
- bloqueio de senhas comuns e padrões óbvios (sequências de teclado e de
  números, repetição do mesmo caractere, raízes como `senha`, `password`,
  `aveto`, times, `teste`), comparando sem acento, sem caixa e desfazendo trocas
  do tipo `@`→`a`, `0`→`o`, `3`→`e`. A comparação roda nas **duas formas** — com
  os dígitos preservados e com as trocas desfeitas — para que `123456` dentro de
  uma senha longa e complexa também seja pego;
- bloqueio de nome, parte local do e-mail e CPF dentro da senha.

O **login não usa esta regra**: senha antiga de 6 caracteres continua entrando
normalmente (`loginSchema` em `src/pages/Auth.tsx` e `auth-login`).

## Onde está aplicada

| Caminho | Arquivo | Validação |
|---|---|---|
| Criar conta | `src/pages/Auth.tsx` (`signupSchema`) | navegador + serviço de contas |
| Redefinição por link | `src/pages/ResetPassword.tsx` | navegador + serviço de contas |
| Primeiro acesso | `src/pages/PrimeiroAcesso.tsx` | navegador + serviço de contas |
| Recuperação por código | `src/pages/EsqueciSenha.tsx` + `auth-recovery-reset` | navegador + **servidor** |
| Portal do colaborador | `src/pages/AtivarAcesso.tsx` + `dp-alterar-senha-colaborador` | navegador + **servidor** (subiu de 8 para 12) |

Medidor de força: `src/components/auth/MedidorSenha.tsx`. É **local** — a
avaliação roda em memória, sem biblioteca externa e sem enviar a senha a
terceiros. É **heurístico**: orienta visualmente (tamanho, variedade e padrões
óbvios) e não mede entropia real; o que aprova ou recusa é sempre `avaliarSenha`.

Recusa genérica de "senha fraca" vinda do serviço de contas **não** é
apresentada como vazamento: só quando a resposta indica vazamento (`pwned`,
`leaked`, `compromised`, `known to be`) a mensagem fala em vazamentos.

## Servidor de contas gerenciado

`supabase/config.toml` **não configura** a política do servidor de contas
gerenciado: o arquivo só traz `project_id` e `verify_jwt` por função. Tamanho
mínimo e classes obrigatórias do serviço são ajustados na própria configuração
gerenciada (Usuários → Configurações de autenticação → E-mail).

**Verificado pelo proprietário em 19/09/2026:** mínimo de **12** salvo e
confirmado ao reabrir a tela (captura de tela), bloqueio de senhas vazadas
marcado e as **quatro classes** exigidas. A regra do aplicativo está alinhada a
essa configuração, inclusive no conjunto de símbolos.

**Bloqueio de senhas vazadas: ATIVADO** em 19/09/2026 pela ferramenta nativa de
configuração de autenticação, que respondeu `Auth configuration updated
successfully` (não é inferência de log de cache). Verificação recomendada na
mesma tela de configurações.

O serviço de contas **não oferece gancho de força de senha**; a arquitetura de
cadastro e os ganchos de autenticação não foram alterados neste patch. Onde não
há função própria (criar conta e link de recuperação), a barreira do lado do
servidor é a configuração gerenciada; a regra completa (lista de senhas óbvias e
dados pessoais) é aplicada no navegador.

## Verificação em duas etapas

Mantida como está: o cadastro do aplicativo autenticador fica em
**Configurações → segurança** (`src/pages/Configuracoes.tsx` →
`src/components/settings/TwoFactorCard.tsx`); o desafio no login usa
`src/components/auth/MfaChallenge.tsx`. Hoje só é exigido de quem já ativou um
fator (`src/App.tsx` e `src/routes/onboardingGuards.tsx`). **Nenhuma nova
obrigatoriedade** foi introduzida neste patch — obrigar segundo fator (por
exemplo para Open Finance) exige plano de implantação e fica como item separado.
