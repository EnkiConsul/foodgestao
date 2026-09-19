# S3 — Auditoria de senhas, política efetiva e verificação em duas etapas (somente leitura)

Nada foi alterado: sem código, sem migrations, sem configuração, sem chamadas que modificam estado. Nenhum dado pessoal, credencial ou log de pessoa foi lido.

## 1. Todos os caminhos que criam ou trocam senha

| # | Caminho | Arquivo(s) | Regra no navegador | Regra no servidor |
|---|---|---|---|---|
| 1 | Cadastro (criar conta) | `src/pages/Auth.tsx:39` → `src/hooks/useAuth.tsx:69` (`supabase.auth.signUp`) | mínimo 6, sem exigência de maiúscula/número/símbolo | nenhuma validação própria: só o serviço de contas |
| 2 | Entrar | `src/pages/Auth.tsx:34`, `src/lib/authUnified.ts:17`, `supabase/functions/auth-login/index.ts:12` | mínimo 6 | `password: min(1)` — proposital, para não barrar senha antiga |
| 3 | Recuperação por código (fluxo próprio) | `src/pages/EsqueciSenha.tsx:128` → `auth-recovery-request` / `auth-recovery-verify` / `supabase/functions/auth-recovery-reset/index.ts:10,28-31,61` | mínimo 12 | **12+ com maiúscula, minúscula, número e símbolo** (mais forte hoje) |
| 4 | Link de recuperação do serviço de contas | `src/pages/ResetPassword.tsx:15,64` (rota `/reset-password`, `App.tsx:603`) | mínimo 6 | nenhuma validação própria (**ponto mais fraco**) |
| 5 | Primeiro acesso | `src/pages/PrimeiroAcesso.tsx:15-22,86` (`supabase.auth.updateUser`) | 8+ com maiúscula, minúscula, número e símbolo | nenhuma validação própria |
| 6 | Ativação / redefinição do portal do colaborador | `src/pages/AtivarAcesso.tsx:14-21` (rotas `/ativar-acesso`, `/redefinir-acesso`) → `supabase/functions/dp-alterar-senha-colaborador/index.ts:23-31,63-67,103` | 8+ com as quatro classes | 8 a 72 com as quatro classes, limite por IP e por link |
| 7 | Criação de acesso pelo gestor | `supabase/functions/dp-criar-acesso-colaborador/index.ts:76-79,116-118` | — | senha aleatória descartada (`gerarCodigo(20)aA1!`), `must_change_password = true`; o gestor nunca conhece a senha |
| 8 | Reenvio de acesso pelo gestor | `supabase/functions/dp-reset-password/index.ts:20-44` | — | não gera senha: invalida códigos e emite link de uso único |
| 9 | Convites de empresa | `supabase/functions/send-company-invite`, `supabase/functions/accept-invite` | — | não tratam senha; a pessoa convidada cai no caminho 1 |

Não existe módulo único de regra de senha: hoje convivem **quatro** regras diferentes (6, 8, 12 e nenhuma). Também **não existe medidor de força** em nenhuma tela (busca por `strength`/`força` em `src/` não retorna nada).

## 2. Política efetiva no servidor versus `supabase/config.toml`

- `supabase/config.toml` **não tem nenhum bloco `[auth]`** — só `project_id` e `verify_jwt` por função. Toda a política de senha vive nas configurações gerenciadas do Cloud, fora do repositório.
- Configuração efetiva lida sem alterar nada (`GET /auth/v1/settings`): e-mail/senha ativo, cadastro liberado, confirmação de e-mail exigida, telefone desligado, chaves de acesso desligadas, nenhum provedor social ativo (inclusive Google), SSO corporativo desligado, visitante anônimo desligado.
- Os registros do serviço de contas mostram, a cada recarga de configuração, `Pwned passwords cache is 292.77 KB` — indício forte de que o **bloqueio de senhas vazadas já está ativo** em produção.
- **Não há como ler pelas ferramentas disponíveis** o tamanho mínimo nem as classes de caractere exigidas pelo serviço de contas. Enquanto não houver confirmação, deve-se tratar o mínimo como o padrão (6).
- Ganchos: o único gancho configurado é o de e-mail (`auth-email-hook`). O serviço de contas **não oferece gancho de força de senha**; existe apenas gancho de tentativa de verificação (depois do login). Logo, bloquear senha comum/vazada no cadastro só é possível (a) pelas configurações do serviço de contas — mínimo, classes obrigatórias e lista de vazadas — ou (b) passando o cadastro por uma função própria no servidor.

## 3. Verificação em duas etapas hoje

- Cadastro do aplicativo de autenticação: `src/components/settings/TwoFactorCard.tsx` (ativar, confirmar, desativar). Desafio no login: `src/components/auth/MfaChallenge.tsx`.
- Exigência: `src/App.tsx:363-374` e `src/routes/onboardingGuards.tsx:168-177,208` só checam o nível da sessão e mandam para `/auth` quando o serviço pede o segundo fator. Isso alcança **apenas quem já ativou** um fator — não há obrigatoriedade para ninguém.
- `src/components/auth/MfaEnrollRequired.tsx` existe mas **não é usado em lugar algum** — a tela de "ativação obrigatória" está pronta e desligada.
- Open Finance: `src/pages/ConexoesPluggy.tsx:83` só exibe o estado "Aguarda MFA" do próprio banco; `pluggy-connect-token`, `pluggy-sync-item`, `pluggy-disconnect-item` e `pluggy-pause-or-delete` checam permissão de contas, **nunca o nível da sessão**. Ou seja: hoje não existe segundo fator exigido para mexer em conexões bancárias.
- `admin-reset-mfa` permite ao administrador remover o fator de alguém.

## 4. Recomendação executável (nada aplicado)

Fase 1 — servidor de contas (fecha o furo sem tocar no login antigo)
1. Confirmar/ativar bloqueio de senhas vazadas.
2. Elevar o mínimo para 12 caracteres e exigir as quatro classes nas configurações gerenciadas. Isso vale ao **definir** senha (cadastro, redefinição, troca) e não invalida quem entra com senha antiga de 6 — os logins atuais continuam funcionando.

Fase 2 — regra única no aplicativo
3. Criar um módulo único de senha (12 a 128, quatro classes, recusa de senhas óbvias e das que contenham nome/e-mail/CPF, além de pontuação de força) e usá-lo nos caminhos 1, 3, 4, 5 e 6, substituindo os mínimos de 6 e de 8.
4. Medidor de força visível nas mesmas telas, com texto em português e mensagens do servidor já traduzidas (padrão que `PrimeiroAcesso.tsx:29` já usa).

Fase 3 — servidor próprio onde existe
5. Subir `dp-alterar-senha-colaborador` de 8 para 12 e acrescentar a recusa de senhas óbvias; manter `auth-recovery-reset` em 12 e alinhar a mesma lista.
6. Cadastro e link de recuperação do serviço de contas não passam por função nossa: ali a garantia vem da Fase 1. Se quisermos a mesma lista de recusa também no cadastro, é preciso passar o cadastro por uma função própria — decisão separada, com impacto no fluxo de confirmação de e-mail.

Fase 4 — segundo fator (decisão sua, fora do escopo de senha)
7. Obrigar segundo fator para quem administra Open Finance: exigir nível elevado da sessão nas funções de conexão e exibir a tela já existente de ativação obrigatória.

## 5. Limitações de acesso, honestamente

- Tamanho mínimo e classes exigidas pelo serviço de contas não são legíveis por nenhuma ferramenta disponível; o bloqueio de vazadas está inferido dos registros do serviço, não comprovado por leitura de configuração.
- A ferramenta de configuração de autenticação disponível cobre bloqueio de vazadas, confirmação automática, cadastro e exigência de senha atual — **não** cobre mínimo de caracteres nem classes obrigatórias; isso precisa ser ajustado nas configurações do Cloud (Usuários → Configurações de autenticação → E-mail).
- Nada foi testado com conta real; a verificação de cada regra nova exigirá senhas fictícias em ambiente de teste.

## 6. Pontos a confirmar antes de implementar

1. Aplicar 12+ a todos os caminhos de definição de senha, inclusive portal do colaborador (hoje 8)?
2. A obrigatoriedade de segundo fator para Open Finance entra agora ou fica como item separado?
3. Trocar o cadastro para passar por função própria (para ter a mesma lista de recusa) ou aceitar que ali a garantia venha só das configurações do serviço de contas?
