# Revisão final do cadastro de contas por empresa

## Objetivo
Corrigir exclusivamente os bugs confirmados no cadastro múltiplo, sem migration, alteração de dados reais, mudanças de RLS ou publicação.

## Alterações
- Separar a edição em dois modos explícitos:
  - **Editar conta**: atualiza somente os dados cadastrais da conta original.
  - **Criar em outras empresas**: cria somente novas contas em um único lote, com título, aviso e botão **Criar cópias**; não atualiza nem exclui a original.
- Confirmar a atualização com retorno do `id`; resposta sem linha será tratada como falha de permissão/escopo.
- Manter saldo PJ sempre por empresa em `balanceByCompany`, inclusive com apenas um destino, preservando valores ao marcar e desmarcar empresas. PF continuará usando o saldo único e o rótulo **Pessoal**.
- Remover o fallback de `resolvePrimaryCreatedId`: sem conta criada na empresa ativa, retornar `undefined`, atualizar a listagem e não abrir a importação.
- Bloquear submissões repetidas também no início do handler e distinguir falhas conhecidas de permissão das falhas de rede com resultado indeterminado.
- Ajustar textos para “saldo próprio” e deixar explícito que cópias manuais não levam lançamentos nem conexão Open Finance.

## Testes
- Adicionar testes de interação do diálogo com backend simulado para:
  - preservar saldos ao alternar destinos;
  - inserir duas contas em um único lote com saldos distintos;
  - manter diálogo aberto e não indicar sucesso em erro de RLS;
  - rejeitar update com zero linhas;
  - garantir que o modo cópia não chama update nem delete;
  - tratar exceção de rede sem afirmar que nada foi salvo;
  - não iniciar importação quando os destinos não incluem a empresa ativa;
  - manter PF com saldo único e rótulo Pessoal.
- Executar os testes focados, a suíte aplicável e a verificação de tipos.

## Limites
- Nenhuma migration será criada ou aplicada.
- Nenhuma conta, vínculo, consentimento ou política real será alterada.
- Nenhuma correção anterior de Open Finance será modificada.
- O frontend não será publicado.

## Relato final
Informar arquivos alterados, resultados reais dos testes e tipos, commit resultante e a mensagem exata registrada na tentativa anterior de migration, sem dados sensíveis.
