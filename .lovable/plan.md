# Segurança das funções de servidor (Edge Functions) — diagnóstico e correções

Foram revisadas as 62 funções do projeto: quem pode chamar, se a identidade é conferida, se o vínculo com a empresa é validado, como os segredos são comparados e o que é devolvido em caso de erro.

## O que já está correto

- 45 funções conferem a identidade de quem chama antes de agir; as administrativas checam papel de super admin no servidor.
- Todas as funções de Open Finance e as de acesso de colaborador confirmam que a pessoa pertence à empresa do registro antes de usar privilégio elevado.
- Login exige o desafio anti-robô e tem limite de tentativas persistente; a recuperação de senha consome o código de forma atômica (não é reutilizável).
- Nenhum endpoint aceita mais segredo pela URL — só por cabeçalho.
- A varredura de banco não apontou nenhuma falha crítica de permissão.

## Correções propostas, em ordem de risco

### 1. Três funções de Pessoas sem conferência de identidade
`dp-sorteio-folgas`, `dp-send-broadcast` e `dp-notify-atestado` apenas verificam se existe um cabeçalho de autorização — não validam o token nem confirmam que a empresa informada no pedido é a da pessoa. Hoje quem barra é só a regra de acesso do banco; qualquer falha futura de regra vira acesso indevido, e o disparo de mensagens em massa é uma ação sensível.
Correção: validar o token, recusar com 401 quando inválido e confirmar o vínculo com a empresa informada antes de qualquer gravação ou envio.

### 2. Detalhes internos vazando nas mensagens de erro
31 funções devolvem ao navegador o texto cru do erro do banco (nomes de tabela, coluna e mensagens de regra de acesso). Isso ajuda quem tenta mapear o sistema.
Correção: padronizar uma resposta genérica por tipo (dado inválido, sem permissão, não encontrado, erro interno) e registrar o detalhe apenas no log do servidor. Criar um utilitário compartilhado para não repetir código.

### 3. Comparação de segredo do webhook de cobrança
`asaas-webhook` compara o token com igualdade simples. Todos os outros webhooks já usam comparação em tempo constante.
Correção: usar o mesmo utilitário compartilhado e recusar quando o segredo não estiver configurado.

### 4. Falta limite de tentativas nos passos 2 e 3 da recuperação de senha
Só o primeiro passo tem limite persistente. Os passos de conferir o código e trocar a senha podem ser chamados repetidamente de fora.
Correção: aplicar o mesmo limite por origem/identificador nas duas funções, com resposta genérica ao estourar.

### 5. Formulário público de contato sem desafio anti-robô
`mkt-lead` só limita por origem; um robô troca de origem e continua inserindo.
Correção: exigir o mesmo desafio anti-robô já usado no login, mantendo o limite atual.

### 6. Origens liberadas para qualquer site
Todas as funções respondem com liberação total de origem, inclusive as administrativas e as de acesso. Não é um furo por si só (o token continua exigido), mas facilita abuso a partir de páginas de terceiros.
Correção: restringir as funções sensíveis (administrativas, de acesso e de Pessoas) às origens do produto — domínio próprio, prévia e ambiente local — mantendo liberação ampla apenas nos webhooks e nas rotas realmente públicas.

### 7. Funções críticas fora da checagem automática de tipos
Onze funções estão numa lista de exceção, entre elas o endpoint de agentes, o agente financeiro e o gancho de e-mail de autenticação. Sem checagem, um erro de tipo em código sensível só aparece em produção.
Correção: tirar essas três da lista de exceção e corrigir o que aparecer; as demais ficam para uma etapa seguinte.

### 8. Sem teste automatizado de autorização das funções
Existem testes de isolamento no banco, mas nada que verifique as funções em si.
Correção: suíte que, para cada função com identidade obrigatória, confirme recusa sem token, recusa com token de outra empresa e recusa quando falta papel administrativo; entra no gate de publicação.

## Detalhes técnicos

- Novo `supabase/functions/_shared/http.ts` com `jsonError(kind, status)` (mensagem genérica + `console.error` do detalhe) e `allowedOrigin(req)` derivando os cabeçalhos de origem por lista permitida; `_shared/secret.ts` reutilizado em `asaas-webhook`.
- Novo `supabase/functions/_shared/authz.ts` com `requireUser(req)` (`getClaims` sobre o token) e `requireCompanyMember(admin, userId, companyId)` (reaproveita o padrão de `company_members` + dono em `companies` já usado nas funções Pluggy). Aplicado em `dp-sorteio-folgas`, `dp-send-broadcast`, `dp-notify-atestado` e como defesa extra em `dp-doc-bulk-ingest`, `dp-doc-bulk-discard`, `dp-doc-bulk-approve`, `dp-generate-disciplinary-pdf`.
- Limite de tentativas: reutilizar a tabela `auth_rate_limits` e o helper já usado por `auth-recovery-request` em `auth-recovery-verify` e `auth-recovery-reset`; chave por IP + `challenge_id`.
- `mkt-lead`: verificação Turnstile via `_shared/turnstile-env.ts`, campo `turnstile_token` no schema Zod e envio do token no formulário da landing.
- `scripts/deno-check.baseline.json`: remover `mcp`, `ai-financial-agent`, `auth-email-hook`.
- Testes: `src/test/functions/edge-authz.test.ts` (invocações reais contra as funções implantadas, puladas sem credenciais, mesmo padrão da suíte de tenancy) + caso unitário para `jsonError` e `allowedOrigin`.
- Sem migração de banco. Sem mudança visível de tela, exceto o desafio anti-robô no formulário de contato da landing.
- Ao final: checagem de tipos, `deno check`, testes e implantação das funções alteradas.

## Fora deste bloco

- Os dois avisos de banco (leitura própria das convocações pelo colaborador) — decisão funcional, não exposição.
- Restringir origem nas demais funções e limpar as oito exceções restantes da checagem de tipos.
