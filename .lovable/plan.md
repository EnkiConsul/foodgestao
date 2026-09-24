# Blindar "Ver salários" e "Ver saldos" no banco

## Objetivo
Quem tiver "Ver salários" ou "Ver saldos" desligado não consegue mais ler esses dados por fora da tela, nem pelo console do navegador. Quem tem a opção ligada, o dono e o administrador continuam vendo tudo como hoje.

## O que muda para o usuário
- Pessoas 360°: com "Ver salários" desligado, salário, CPF, PIX, banco, agência e conta aparecem mascarados (ex.: `***.456.789-**`, `R$ ••••`) em todas as telas e também no banco.
- O colaborador continua vendo os próprios dados completos no Portal.
- Financeiro: com "Ver saldos" desligado, os saldos das contas chegam vazios do banco. Valores de lançamentos continuam visíveis para lançar, baixar e conferir (opção 1 escolhida).
- Gravar salário e dados bancários continua seguindo o nível da matriz (Alteração ou mais).

## Etapas
1. **Banco (precisa da sua autorização na migração)**
   - Função `private.pode_ver_salarios(usuario, empresa)` e `private.pode_ver_saldos(usuario, empresa)`: dono, administrador, suporte ou opção ligada.
   - Retirar do usuário logado a leitura direta das colunas confidenciais do cadastro de colaboradores (16 campos: salário, base salarial, CPF, RG e órgão, PIS, banco, agência, conta, dígito, tipo, chave e tipo de PIX) e dos saldos das contas.
   - Nova consulta segura `dp_colaboradores_confidencial(ids)`: devolve esses campos completos ou mascarados conforme a permissão, sempre conferindo empresa e matriz.
   - Nova consulta segura para saldos das contas e ajuste de `get_accessible_accounts` e das rotinas de saldo para devolver vazio sem permissão.
   - Rotinas internas e funções de servidor não são afetadas (rodam com acesso do sistema).
   - Reversível: o rollback devolve os acessos às colunas.
2. **Telas**
   - Trocar as 3 leituras "cadastro inteiro" (lista de colaboradores e comparação da ficha) por lista explícita de campos.
   - As cerca de 40 telas que usam salário/CPF/dados bancários passam a buscá-los pela consulta segura (ficha, remuneração, documentos, relatórios, exportações, Portal).
   - As 14 telas de saldo passam pela consulta de saldos.
3. **Testes**
   - Teste no banco: membro com "consulta" e "Ver salários" desligado recebe campos mascarados e erro ao ler a coluna direto; com a opção ligada, recebe completo.
   - Mesmo teste para saldos.
   - Navegação pelas telas principais (ficha, lista, Portal, Contas, Dashboard) sem erro.

## Riscos
- É a mudança mais ampla até aqui: se alguma tela ainda pedir o cadastro inteiro, ela passa a dar erro. Por isso faço o mapeamento completo antes de retirar o acesso e testo as telas no final.
- O projeto tem congelamento de versão registrado; nada será publicado.

## Detalhes técnicos
- `REVOKE SELECT (cols) ON dp_colaboradores FROM authenticated` exige primeiro `REVOKE SELECT` da tabela e `GRANT SELECT (demais colunas)`; o mesmo para `accounts(initial_balance, current_balance)`.
- PostgREST rejeita `select("*")` sem acesso a todas as colunas: `useDpColaboradores.tsx` e `FichaComparacaoDialog.tsx` precisam de lista explícita; embeds `dp_colaboradores(...)` em outras tabelas auditados via `rg`.
- RPC SECURITY DEFINER, `search_path = public`, filtra por `private.dp_pode_ler_empresa` + `tem_permissao('dp.colaboradores','consulta')` ou `user_id = auth.uid()`; EXECUTE só para authenticated/service_role.
