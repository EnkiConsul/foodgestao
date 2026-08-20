# Bolinha vermelha na aba Dados de colaborador desligado

## O que está acontecendo

A bolinha vermelha na aba **Dados** indica "pendências nesta aba". No caso da Kássia não há pendência alguma: nome, CPF, cargo, unidade, admissão, nascimento e data de demissão (12/06/2026) estão preenchidos. O indicador aparece porque a regra atual liga o ponto vermelho sempre que o colaborador está **inativo**, independentemente de faltar algo — ou seja, todo desligado mostra alerta vermelho eternamente.

## Correção

- O ponto vermelho na aba Dados passa a aparecer **somente quando falta informação obrigatória** (incluindo desligado sem data de demissão).
- Para colaborador desligado com dados completos, a aba Dados fica sem indicador; o status de desligamento continua visível no cabeçalho da ficha (selo "Desligado") e na seção de desligamento dentro da aba.
- Manter tooltip/rótulo explicando o indicador: ao passar o mouse no ponto, mostrar "Falta preencher campos obrigatórios" — hoje só existe `aria-label`, o usuário não tem como saber o motivo.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`, `TabsTrigger value="dados"`: trocar a condição `(dadosPendente || isDesligado)` por `dadosPendente`. A regra `isDesligado && !form.data_desligamento` já está dentro de `dadosPendente`, então nada de validação se perde.
- Envolver os pontos de pendência (Dados e Remuneração) em `Tooltip` com texto explicativo, mantendo `aria-label`.
