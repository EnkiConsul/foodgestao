# Benefícios: cálculo mensal auditável e histórico

## Objetivo
Transformar a tela de Benefícios em um fluxo único e compreensível para VA e VT, corrigir o erro de carregamento e permitir conferir no calendário exatamente quais dias formaram o valor de cada colaborador.

## Estrutura da tela
- Substituir as quatro abas atuais por **Cálculo mensal** e **Histórico**.
- Em **Cálculo mensal**, reunir competência, unidade, seletor VA/VT, pagamento, corte, indicadores e lista de colaboradores.
- Manter **Catálogo e configurações** como ação secundária, sem competir com o cálculo mensal.
- Seguir a direção escolhida “Unified benefits dashboard”: Sora + Manrope, paleta operacional azul/cinza/âmbar e layout de dashboard com lista à esquerda e painel de auditoria à direita.
- No mobile, abrir a auditoria em painel/tela sobreposta, preservando lista e filtros sem rolagem horizontal.

## Correções do cálculo
- Remover a leitura que exige uma única configuração de DP; resolver a regra aplicável por hierarquia **empresa → unidade → colaborador**, evitando o erro causado pelas três configurações existentes.
- Aplicar a regra a **todos os colaboradores**, cada um com sua unidade, jornada e regime: a folga dominical prevista em regra é sempre deduzida, mesmo quando ainda não foi lançada manualmente no calendário. A Cristiane serve apenas como caso de conferência.

- Manter a precedência das fontes: convocações aceitas para intermitentes; escala publicada quando houver; jornada habitual nos demais casos.
- Deduzir da cobertura futura as folgas semanais, folgas dominicais previstas, folgas extras e férias; deduzir também os dias pagos e não trabalhados do período anterior conforme as regras do benefício.
- Evitar contagem duplicada quando a mesma data aparecer em mais de uma origem.

## Memória de cálculo por colaborador
Ao selecionar uma linha, exibir:
- Calendário do período com legenda visual para trabalho pago, folga semanal, folga dominical prevista, folga extra, férias, convocação e ajuste anterior.
- Resumo numérico auditável, por exemplo: **27 dias de jornada − 4 folgas semanais − 1 folga dominical = 22 dias**.
- Valor diário, dias finais, desconto do colaborador, acerto do período anterior e total a depositar.
- Origem de cada regra aplicada: empresa, unidade ou configuração individual.

## Histórico
- Usar a estrutura de apurações de VA existente como base e confirmar sua capacidade para registrar também VT e a memória detalhada antes de qualquer alteração no banco.
- Salvar cada fechamento mensal com competência, tipo, parâmetros, valores e detalhamento por colaborador.
- Exibir histórico por competência, unidade e tipo, com reabertura da mesma memória de cálculo e exportação CSV.

## Implementação técnica
- Centralizar o detalhamento diário no motor `va-calculo.ts`, retornando não apenas totais, mas a classificação de cada data.
- Fazer `useDpValeCalculadora.tsx` resolver configurações por escopo e entregar os dados do calendário e da fórmula.
- Reestruturar `DpBeneficios.tsx` e `ValeCalculadora.tsx` conforme o protótipo escolhido, reutilizando os componentes e tokens semânticos do projeto.
- Preservar os diálogos atuais de criação, edição e atribuição de benefícios dentro da ação secundária de configuração.

## Validação
- Criar testes para configuração global versus unidade, folga dominical prevista, sobreposição de folgas/férias, acerto anterior e intermitente sem/com convocações.
- Validar especificamente o caso da Cristiane, que deve explicar no calendário a passagem de 27 para 22 dias antes de outros ajustes.
- Conferir carregamento, seleção de colaborador, VA/VT, histórico e responsividade em desktop e mobile.
