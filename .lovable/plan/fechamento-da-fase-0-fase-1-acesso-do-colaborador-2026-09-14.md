# Fechamento da Fase 0 + Fase 1 (acesso do colaborador)

## Parte A — Fechamento da divergência da Fase 0

HOUVE ALTERAÇÃO REAL. A Fase 0 não alterou nenhum arquivo do aplicativo, mas duas regras de acesso foram
corrigidas no banco. Evidência conferida agora:

| Item | Antes | Agora |
|---|---|---|
| Advertências/suspensões (`public.dp_registros_disciplinares`, leitura) | qualquer pessoa vinculada à empresa | apenas dono e administrador da empresa |
| Arquivos disciplinares (cofre `dp-disciplinar`, leitura) | qualquer pessoa vinculada à empresa | apenas dono e administrador, e somente da própria empresa (pasta = empresa) |

- Migração: `supabase/migrations/20260914051131_2d6603ad-c26e-42eb-8eed-4590a9410084.sql`
- Regras trocadas: `dp_disc_read` (tabela) e `dp_disciplinar_read` (arquivos), ambas passando a usar
  `private.is_company_admin_or_owner`
- Nenhum arquivo de código alterado; nenhuma senha, token ou dado apagado
- Verificação: consulta às regras ativas no banco confirma as duas com a nova condição; o verificador de
  segurança marcou os dois pontos como resolvidos

## Restrição do salário-base dos cargos

Diagnóstico atual (verificado): o salário fica em `dp_cargos.salario_base` e em `dp_cargo_salarios.salario_base`
(piso por unidade/sindicato). Hoje as duas tabelas liberam leitura para **qualquer pessoa vinculada à empresa**
(`private.is_company_member`), e a escrita já é só de dono/administrador. Nenhum colaborador do portal tem
vínculo de membro hoje (conferido: zero registros), então o vazamento possível é para membros comuns/gestores,
não para o portal. Telas/consultas envolvidas: `useDpCadastros` (lista de cargos com `select("*")` e lista de
pisos), `cargoSalariosQuery.ts`, `DpCargos.tsx`, `CargoSalariosUnidadePanel.tsx`, `ColaboradorCondicoesDialog.tsx`,
`CargoQuickCreateDialog.tsx`, ficha de registro (coluna "Salário") e `pakere-legacy-import`.

O que será feito:

- Leitura de `dp_cargo_salarios` passa a ser só de dono/administrador (e super admin quando aplicável).
- Em `dp_cargos`, a coluna de salário deixa de ser legível por membros comuns; nome, código e demais dados do
  cargo continuam visíveis para quem precisa montar escala, rotina e cadastro.
- As telas param de pedir "todos os campos" do cargo e passam a pedir a lista de campos permitida; o salário é
  buscado por um caminho separado, liberado só para dono/administrador.
- Onde o usuário não tem permissão, a tela mostra "—" em vez de erro, e a exportação da ficha omite a coluna.
- Gestor **não** recebe permissão nesta fase.

## Parte B — Fase 1: segurança do acesso do colaborador

Diagnóstico atual (revalidado nos arquivos): as três funções de servidor de acesso já validam sessão e
dono/administrador da empresa, mas **devolvem a senha em texto** para o navegador
(`dp-criar-acesso-colaborador`, `dp-reset-password`, `dp-alterar-senha-colaborador`). A tela
`ColaboradorAcessoPanel.tsx` mostra a senha, permite copiar, permite o gestor digitar uma senha específica e
enviar a senha por WhatsApp. `dp-invite-colaborador` é um caminho antigo em paralelo.

### Novo fluxo

```text
Gestor  →  "Liberar acesso"      → cria o usuário (login = CPF) sem senha utilizável
                                 → gera código de ativação de uso único (só o hash é guardado)
                                 → gestor vê apenas: login CPF + link do portal + prazo do código
Colaborador → abre o link, informa CPF + código → cria a própria senha → código é invalidado

Gestor  →  "Redefinir acesso"    → invalida códigos anteriores e gera um novo de reset
Gestor  →  "Bloquear acesso"     → impede entrada até nova liberação
```

O gestor nunca vê, define, copia ou consulta a senha. A mensagem de WhatsApp passa a levar só link, instrução e
login (CPF) — sem senha.

### Estados no painel

SEM ACESSO · ACESSO PENDENTE DE ATIVAÇÃO · ACESSO ATIVO · REDEFINIÇÃO SOLICITADA · ACESSO BLOQUEADO
Ações: "Liberar acesso", "Reenviar ativação", "Redefinir acesso", "Bloquear acesso".

### Detalhes técnicos

- Nova tabela `dp_portal_access_tokens`: `user_id`, `colaborador_id`, `company_id`, `token_hash` (único, SHA-256),
  `purpose` ('activation' | 'reset'), `expires_at` (48h ativação / 2h reset), `consumed_at`, `created_by`,
  `created_at`. RLS fechada para o cliente (nenhuma policy de leitura/escrita para `authenticated`); só
  `service_role`. Índices em `token_hash` e `(user_id, purpose)` parcial em pendentes.
- Funções de servidor:
  - `dp-criar-acesso-colaborador`: cria usuário com senha aleatória descartada, marca
    `must_change_password`, emite token de ativação, responde `{ status, expires_at }` — **sem `password`**.
  - `dp-reset-password`: invalida tokens pendentes (`consumed_at = now()`), emite novo token de reset, responde
    sem senha.
  - `dp-alterar-senha-colaborador`: passa a aceitar apenas o consumo do token pelo próprio colaborador
    (`{ cpf, token, nova_senha }`), sem exigir sessão; identidade resolvida pelo hash do token, nunca por
    `colaborador_id` do navegador. O caminho administrativo de definir senha é removido.
  - Nova `dp-bloquear-acesso-colaborador` (bloquear/reativar).
  - Todas: método HTTP validado (POST), CORS compartilhado, erros genéricos, nada de senha/token em log,
    busca de usuário por e-mail em vez de listagem paginada.
- `dp-invite-colaborador`: marcado como legado após inventário de chamadas; permanece no repositório com aviso
  de descontinuação e plano de remoção na Fase 12.
- Frontend: `ColaboradorAcessoPanel.tsx` sem senha, sem "definir senha específica", sem copiar senha;
  `PrimeiroAcesso.tsx` ganha a etapa CPF + código antes de criar a senha (mantendo as regras de força já
  existentes); `WhatsappComposerDialog`/modelos de mensagem sem campo de senha.
- Auditoria: eventos `access_activation_requested`, `access_activated`, `password_reset_requested`,
  `password_reset_completed`, `access_blocked` com autor, alvo, empresa e horário — sem senha nem token.
- Concorrência: um único token pendente por finalidade; token já usado ou expirado falha; usuário já vinculado
  não gera duplicidade; conflito de identidade falha fechado pedindo revisão administrativa.

### Migrações

1. Restrição do salário-base (leitura de pisos e da coluna de salário).
2. Tabela de tokens de acesso com RLS fechada, índices e permissões mínimas.

Rollback informado para cada uma (restaurar as regras anteriores; remover a tabela de tokens; versões
anteriores das funções). Quem já tem acesso ativo continua entrando normalmente — só o caminho de emissão muda.

### Validação e testes

`npm run typecheck:strict`, `npm run lint`, `npm test`, `npm run build`, `deno check` nas funções alteradas,
verificador de segurança, mais testes de: gerar acesso na própria empresa; tentar em empresa alheia (403);
colaborador chamando ação administrativa (403); resposta sem campo de senha; token de uso único; token expirado;
novo reset invalidando o anterior; usuário já vinculado sem duplicidade; conflito falhando fechado; colaborador
definindo a própria senha. Regressão: login, portal, documentos, logout, primeiro acesso, carência de
desligamento e multiempresa. Erros preexistentes serão listados separados dos introduzidos.

Ao concluir a Fase 1: PARAR e aguardar aprovação. A Fase 2 não será iniciada.
