# Corrigir pendências da Cristiane após novo vínculo

## Diagnóstico confirmado

- O botão **Atualizar pendências** recalcula os documentos no banco e, ao final, a tela substitui as pendências documentais calculadas no navegador pelas linhas materializadas.
- A rotina materializada ainda olha somente `data_desligamento` e o regime da ficha atual. Como a ficha da Cristiane está ativa, sem `data_desligamento` e como freelancer, ela não gera a rescisão de agosto/2026. A correção anterior ficou apenas no cálculo temporário do navegador e é removida quando entram as linhas materializadas.
- A Cristiane tem um vínculo CLT encerrado em 27/08/2026, seguido de um novo contrato freelancer em 28/08/2026, e não possui documento de desligamento dessa competência.
- Ela ainda tem três períodos de férias marcados como controle legal ativo, iniciados em 2024, 2025 e 2026. A pendência de férias filtra apenas sócio/inativo e não verifica o regime atual; por isso cobra férias legais de uma freelancer.
- A função atual de recontratação não encerra os períodos de férias do vínculo anterior, e a geração de períodos também não bloqueia regimes sem direito legal a férias.

## Implementação

### 1. Rescisão por vínculo encerrado

- Atualizar a apuração oficial de pendências para considerar o histórico de vínculos.
- Tratar como encerramento apenas o período anterior a uma linha marcada como **novo contrato**, sem confundir alteração de cargo, salário ou unidade com desligamento.
- Cobrar a documentação quando o vínculo encerrado era CLT, intermitente, temporário ou aprendiz, mesmo que a ficha atual seja freelancer.
- Usar a unidade e a data final do vínculo encerrado, manter o prazo de 10 dias e aceitar **Desligamento**, TRCT ou Demonstrativo Rescisório da mesma competência como quitação.
- Manter a operação idempotente, sem duplicar a pendência quando a data atual de desligamento e o histórico representarem o mesmo encerramento.

### 2. Férias separadas por vínculo

- No início de um **novo contrato**, preservar os períodos antigos como histórico, mas retirá-los do controle legal ativo; nenhum registro será apagado.
- Não gerar nem reativar períodos legais para vínculo atual freelancer, PJ/MEI ou sócio.
- Para novo vínculo assalariado, reiniciar a contagem na nova admissão, sem carregar saldo ou prazo do vínculo anterior.
- Corrigir a apuração do Início e do portal para nunca cobrar férias legais quando o vínculo vigente não tiver esse direito.
- Regularizar os períodos antigos da Cristiane para histórico e remover a pendência indevida; não alterar os documentos nem o histórico do vínculo CLT encerrado.

### 3. Consistência e atualização

- Centralizar a regra de regimes com direito a férias para que cadastro, geração de períodos, tela de férias e pendências usem a mesma decisão.
- Marcar a apuração documental como desatualizada quando vínculo, desligamento ou documento de desligamento mudar.
- Após a migração, recalcular somente a empresa afetada para que a rescisão atrasada apareça imediatamente e a férias indevida desapareça.

## Validação

- Provar que a Cristiane passa a ter **Rescisão não importada — vínculo encerrado em 27/08**, competência 08/2026.
- Provar que seus períodos CLT permanecem consultáveis como histórico, mas não geram pendência de férias no vínculo freelancer.
- Testar recontratação como freelancer e como novo vínculo assalariado, alteração interna sem novo contrato, documento já importado, sócio e isolamento entre empresas.
- Executar testes automatizados, verificação de tipos e prova transacional no banco, sem deixar dados de teste.

## Entrega

- Migration isolada e reversível, com permissões preservadas e sem exclusão de dados.
- Relatório final com resultados e evidências.
- Nenhuma publicação do aplicativo sem pedido explícito.
