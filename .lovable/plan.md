# Mês do desligamento: rescisão no lugar do contracheque

## Orientação

No Brasil, o mais comum é o que aconteceu com a Karine: no mês do desligamento as verbas do período trabalhado entram no acerto da rescisão (TRCT / demonstrativo rescisório) e não sai um contracheque separado. Mas não é regra única — parte das empresas emite um recibo de pagamento dos dias trabalhados **além** do TRCT, sobretudo quando a saída é no fim do mês.

Por isso a proposta é:

- **Padrão:** no mês do desligamento o sistema não cobra contracheque; passa a cobrar o documento de rescisão.
- Se a empresa mandar contracheque desse mês também, ele é aceito normalmente e não gera aviso de sobra.
- **Ajuste na configuração do DP** ("Exigir contracheque no mês do desligamento") para a empresa que faz diferente, desligado por padrão.

## O que muda na prática

- Karine, julho/2026: sai a pendência "Contracheque não importado" e entra "Rescisão não importada — KARINE COSTA DA SILVA · unidade — julho/2026".
- A pendência de rescisão é atendida por TRCT ou demonstrativo rescisório do mês do desligamento.
- Prazo da rescisão: 10 dias corridos após o desligamento (prazo legal do acerto), e a pendência entra na mesma ordenação por atraso.
- Folha de ponto continua sendo cobrada no mês do desligamento, como você pediu.
- Adiantamento só é cobrado se a pessoa ainda estava no quadro no dia do adiantamento da unidade.
- Na Conferência de Documentos e na conferência do lote importado, quem foi desligado na competência deixa de aparecer como contracheque faltante e passa a aparecer na linha de rescisão.

## Detalhes técnicos

- `src/lib/dp/pendencias-documentos.ts`
  - `elegivelDocumento` recebe a competência: `contracheque` deixa de ser exigido quando `data_desligamento` cai dentro da competência (salvo flag da empresa).
  - Novo tipo lógico `rescisao` (satisfeito por `trct` ou `demonstrativo_rescisorio`), exigido só na competência do desligamento; helper `competenciaDoDesligamento`.
  - `adiantamento`: exigir apenas se `data_desligamento` for vazia ou >= dia do adiantamento da unidade.
- `src/hooks/useDpPendencias.tsx`
  - `emitirDocumentos` passa a competência para a elegibilidade.
  - Novo bloco de rescisão: carrega `trct` + `demonstrativo_rescisorio` no intervalo, indexa por colaborador+competência, gera pendência individual por pessoa desligada sem documento, com vencimento em `data_desligamento + 10 dias`, ícone e rótulo "Rescisão".
  - Lê o novo flag de `dp_config_dp` junto da configuração já carregada.
- `src/lib/dp/bulk-coverage.ts`: `computeCoverage` deixa de esperar contracheque de quem foi desligado na competência (mesma regra/flag) e aceita `tipo` de rescisão restringindo aos desligados do mês.
- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: usa a elegibilidade compartilhada; linha de rescisão para desligados da competência; contracheque de desligado não gera alerta de faltante.
- Migração: coluna booleana `exigir_contracheque_mes_desligamento` em `dp_config_dp` (default `false`) e o campo correspondente na tela de configuração do DP.
- Testes em `src/lib/dp/__tests__`: caso Karine (julho/2026 sem contracheque, com pendência de rescisão), mês anterior inalterado, flag ligado voltando a exigir contracheque, e adiantamento antes/depois do dia de pagamento.
