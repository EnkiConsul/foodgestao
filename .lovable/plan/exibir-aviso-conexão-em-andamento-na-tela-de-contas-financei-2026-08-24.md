# Exibir aviso "Conexão em andamento" na tela de Contas Financeiras

## Contexto
Atualmente o aviso de **Conexão em andamento** (autorizações Pluggy pendentes de confirmação do banco) só aparece em `Conexões Open Finance`. O usuário quer que ele também seja exibido na página **Contas Financeiras**, já que é lá que o usuário normalmente acompanha suas contas bancárias.

## O que será feito
1. Criar um componente reutilizável `PluggyPendingConnectionAlert` que encapsule:
   - Consulta de autorizações pendentes (`pluggy_connect_requests` com status `open` e não expiradas).
   - Exibição do alerta no estilo já existente (card amarelo, ícone girando, texto explicativo).
   - Botões **Atualizar** (recarrega a consulta) e **Cancelar conexão** (chama `pluggy_cancel_connect_requests` com confirmação).
2. Substituir o bloco inline de `ConexoesPluggy.tsx` pelo novo componente, mantendo o comportamento atual.
3. Inserir o componente no topo de `ContasBancarias.tsx`, logo abaixo do cabeçalho, visível apenas no contexto PJ com empresa selecionada.

## Arquivos alterados
- `src/components/accounts/PluggyPendingConnectionAlert.tsx` — novo componente.
- `src/pages/ConexoesPluggy.tsx` — usa o componente extraído.
- `src/pages/ContasBancarias.tsx` — adiciona o componente abaixo do título.

## Detalhes técnicos
- O componente receberá `companyId: string` como prop e gerenciará seu próprio estado de `pendingCount`, `loading` e `cancelingPending`.
- O cancelamento será feito via `supabase.rpc("pluggy_cancel_connect_requests", { _company_id: companyId })`, igual ao código atual.
- Após cancelamento, o componente atualizará o contador localmente e emitirá um toast de sucesso/erro.
- Não haverá mudança de banco de dados nem de backend; apenas refatoração de frontend para reaproveitar a UI existente.
