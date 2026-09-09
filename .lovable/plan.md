# Auditoria não mostra todos os usuários

## Por que isso acontece (verificado no banco)

A tela de Auditoria não é uma lista de usuários: ela mostra apenas ações que o sistema grava como registro de auditoria. Hoje existem 771 registros, mas de apenas 13 pessoas — porque só um pedaço do sistema grava auditoria.

O que é gravado hoje: lançamentos, categorias, contatos, contas bancárias, empresas e algumas ações do backoffice (isenção de assinatura, ativar/desativar cliente, reset de dados, donos das empresas).

O que **não** é gravado (por isso o usuário nunca aparece):
- Entradas no sistema (logins) e trocas de senha.
- Tudo do Pessoas 360°: colaboradores, cargos, setores, unidades, turnos, escalas, folgas, férias, convocações, documentos, importações.
- Portal do colaborador (quem só usa o portal jamais gera registro).
- Convites, permissões de usuários e módulos contratados.
- Cartões, faturas, orçamentos, centros de custo, formas de pagamento, tags.

Além disso, 32 registros vêm de rotinas do servidor sem o nome de quem agiu (aparecem em branco) e a tela não tem coluna nem filtro por usuário, o que dá a impressão de faltar gente.

## Correções propostas

### 1. Tela de Auditoria
- Nova coluna "Usuário" mostrando o nome real (a partir do id), não só o nome gravado no momento da ação — assim registros sem nome deixam de aparecer em branco.
- Filtro por usuário (lista de quem tem registros) e busca também pelo id.
- Aviso curto explicando que a lista cobre ações registradas; ações de entrada no sistema ficam na aba de acessos.

### 2. Aba "Acessos"
- Nova aba na mesma página listando entradas no sistema (logins, falhas e trocas de senha) lidas dos registros de autenticação, com usuário, data, resultado e origem.

### 3. Ampliar o que é registrado
Passar a gravar auditoria nas áreas que hoje ficam de fora, em ordem:
1. Pessoas 360° (cadastro/edição/desligamento de colaborador, cargos, setores, unidades, turnos, jornadas, sindicatos).
2. Documentos e importações (envio, aprovação, reprovação, exclusão em lote).
3. Escalas, folgas, férias, trocas e convocações (criação, aprovação, cancelamento).
4. Convites, permissões de membros, donos e módulos contratados.
5. Cartões, faturas, orçamentos, centros de custo, formas de pagamento e tags.

## Detalhes técnicos
- Escrita continua pela função `insert_audit_log` (já `SECURITY DEFINER`, com execute para `authenticated`); nas Edge Functions, insert direto com service role, sempre preenchendo `user_id` e `user_name`.
- Front: `src/components/admin/AdminAuditLogs.tsx` ganha coluna/filtro de usuário via `useUserNames`/`ClientCell` e paginação mantida; aba de acessos consome uma nova Edge Function `admin-auth-events` (super admin, service role) que lê os logs de autenticação do projeto.
- Nas áreas de DP, centralizar a chamada em um helper (`src/lib/audit.ts`) para padronizar `action`, `entity_type`, `entity_id` e `details`, evitando repetição em cada hook.
- Novos rótulos de ação no mapa da tela; ações sem rótulo continuam com o texto humanizado atual.

## Validação
- Conferir na tela que registros de rotinas do servidor passam a exibir o nome do usuário.
- Executar uma ação em Pessoas 360° e confirmar o novo registro na Auditoria.
- Confirmar que a aba de acessos lista o login recente e que usuário não super admin continua sem acesso.
