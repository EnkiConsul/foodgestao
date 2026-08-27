# Segurança e Qualidade — bloco de certificação

Objetivo: destravar o release gate zerando os erros bloqueantes de código, tirando as funções críticas do "baseline de exceções", cobrindo o isolamento entre empresas (Financeiro, Pessoas e arquivos) e removendo a autenticação por segredo na URL.

Trabalho tratado como hotfix aprovado dentro do freeze (certificação), sem mudança de comportamento visível para o usuário.

## 1. Zerar erros críticos de código

Situação medida agora: 34 erros de TypeScript no modo estrito e 16 erros de ESLint (os 1.473 avisos ficam fora deste bloco).

- Corrigir os 34 erros de TypeScript, concentrados em: Conciliação Open Finance, convocações e grupos, sugestão de categorização, calendário e férias do módulo Pessoas, lançamentos, categorização por IA, operação do dia, colaboradores, menu mobile, drift de saldos, carregamento tardio de telas, revisões de origem, complementos salariais.
- Corrigir os 16 erros de ESLint: variáveis que deveriam ser constantes, uso de `var` em uma função de aprovação de documentos, expressões de validação com caracteres de controle e uma chamada de hook dentro de callback na tela de Conciliação (essa é uma correção real de comportamento potencial, não cosmética).
- Baixar os tetos em `scripts/quality-ceilings.json` para `typescript_strict_errors: 0` e `eslint_errors: 0`, mantendo o teto de avisos como está.

Regra: nenhuma correção por `any`, `@ts-ignore` ou desabilitação de regra. Onde o tipo real for desconhecido, tipar explicitamente e validar em runtime.

## 2. Tirar as Edge Functions críticas do baseline do Deno

Hoje 18 funções estão isentas da verificação de tipos do Deno. Nesta etapa saem do baseline as críticas (dinheiro, autenticação e integrações externas):

- autenticação e recuperação de senha (3 funções)
- workers de webhook Pluggy e Asaas
- endpoint de agentes (MCP)

Cada uma passa a compilar limpa; as demais continuam no baseline (reduzido) para etapas seguintes.

## 3. Tenancy: Financeiro + Pessoas + Arquivos

A suíte de tenancy já cobre Financeiro (lançamentos, orçamentos, categorias, contatos) e uma parte de Pessoas. Serão acrescentadas:

- **Pessoas:** colaboradores, folgas, férias, escalas/operação e convocações — leitura, escrita e tentativa de troca de empresa a partir de um usuário de outra empresa.
- **Papéis:** membro só-leitura não escreve; administrador não consegue se promover a proprietário.
- **Arquivos:** cada bucket (anexos de lançamentos, documentos de Pessoas, disciplinar, importação em massa) só é lido/gravado por quem é da empresa dona da pasta; usuário de outra empresa recebe negativa.
- **Limpeza:** dois buckets remanescentes do módulo Pedidos (removido) estão sem nenhuma regra de acesso e serão excluídos.

Os testes rodam contra o projeto de teste dedicado (mesmo padrão atual: sem credenciais, são pulados) e entram no job obrigatório de tenancy do release gate.

## 4. Eliminar segredo em query string

Quatro endpoints aceitam o segredo pela URL (`?secret=`) além do cabeçalho: webhook da Pluggy, cron da Pluggy, worker de webhook da Pluggy e worker de webhook do Asaas. Segredo em URL vaza em log de acesso, histórico e referer.

- Remover o fallback por query string; aceitar somente cabeçalho, com comparação em tempo constante.
- Conferir/atualizar a URL registrada no provedor para a versão sem segredo na URL.
- Trocar o agendamento diário de fechamento de fatura, que hoje carrega o segredo escrito direto no comando, para ler o segredo do cofre (padrão já usado pelos outros agendamentos); mesma revisão no agendamento de expiração de trials.
- Teste automatizado: chamada com segredo apenas na URL deve retornar negado; com cabeçalho correto, aceito.

## Ordem de execução

1. Segredo em query string (risco exposto hoje).
2. Erros de TypeScript e ESLint + tetos zerados.
3. Deno: funções críticas fora do baseline.
4. Tenancy Financeiro/Pessoas/Arquivos + remoção dos buckets órfãos.
5. Rodar o gate: TypeScript, ESLint, Deno, migrations, build, testes, tenancy.

## Fora deste bloco

- Os 1.473 avisos de ESLint.
- Os alertas do linter de banco sobre funções com privilégio elevado (bloco de segurança próprio, com decisão caso a caso).
- O teste `operacao-panorama`, que segue como pendência separada do gate.
