# Licença-maternidade (e outros afastamentos longos) no Pessoas 360°

## Situação atual

O banco já prevê o tipo "licença" nas ausências (`dp_folga_tipo`), mas nenhuma tela o usa. Hoje só dá para cadastrar atestado com período, que conta como falta justificada e não tem tratamento legal de licença-maternidade (120 dias, sem desconto, sem alertas trabalhistas, retorno previsto).

## Objetivo

Permitir registrar a licença-maternidade da Rosângela com início em fevereiro/2026 (retroativo) e tratar o afastamento corretamente em todo o módulo.

## O que será feito

### 1. Cadastro de licença na tela Atestados (aba Cadastrar)
- Novo tipo de afastamento: **Licença-maternidade** (e Licença-paternidade), ao lado de Atestado.
- Campos: colaboradora, data de início, quantidade de dias (padrão 120 para maternidade, 5 para paternidade, editável), retorno previsto calculado automaticamente, anexo do documento (certidão/comunicado) opcional.
- Permite data retroativa (fevereiro/2026).

### 2. Efeitos automáticos no período da licença
- Marca os dias como "licença" na operação/escala: a colaboradora aparece como afastada (não como falta).
- Bloqueia convocações, trocas e escalas para ela no período.
- Não gera alertas trabalhistas de jornada nem pendências de faltas no período.
- Suspende cobranças de pendências rotineiras (contracheque segue normal, pois é devido; VA/VT não são devidos nos dias de licença).
- Não interfere em férias: o período de licença-maternidade não prejudica o período aquisitivo.

### 3. Visibilidade
- Ficha da colaboradora mostra "Em licença-maternidade até DD/MM/AAAA" com data de retorno.
- Pendências: na proximidade do retorno (30 dias), surge lembrete de retorno ao trabalho.
- Calendário/painel da operação exibe o afastamento.

### 4. Histórico
- Registro fica no histórico de condições/afastamentos da colaboradora e na auditoria.

## Detalhes técnicos

- Reuso do tipo `licenca` já existente em `dp_folga_tipo` e da geração de registros por período; novo motivo explícito "Licença-maternidade"/"Licença-paternidade" na tela de cadastro (`DpAtestados.tsx` aba Cadastrar e RPC de criação de afastamento).
- Ajustes em `operacao-panorama.ts` (já reconhece `licenca` como afastamento), convocações/trocas (bloqueio no período) e pendências (exceção de VA/VT e lembrete de retorno).
- Testes unitários do cálculo do período e das exceções.
