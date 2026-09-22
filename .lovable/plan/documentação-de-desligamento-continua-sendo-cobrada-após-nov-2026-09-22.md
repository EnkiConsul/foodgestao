# Documentação de desligamento continua sendo cobrada após nova contratação

## O que está acontecendo

A CRISTIANE MARTINS DE JESUS teve o vínculo CLT encerrado em 27/08/2026 e foi
recontratada como freelancer a partir de 28/08/2026. A ficha é a mesma pessoa,
então o campo de data de desligamento voltou a ficar vazio.

Hoje a pendência "Rescisão não importada" só existe enquanto a ficha tem data de
desligamento preenchida e o vínculo atual é assalariado. Com a nova contratação,
a cobrança da documentação de desligamento de agosto desapareceu — mesmo sem
nenhum documento de desligamento importado (confirmado: ela não tem documento de
desligamento, TRCT ou demonstrativo rescisório).

O histórico do vínculo anterior está guardado (período 01/04/2017 a 27/08/2026,
regime CLT), ou seja, a informação existe — só não é usada na cobrança.

## Ficha única ou fichas separadas?

Recomendação: **manter uma única ficha por pessoa**, com o histórico de vínculos
— é assim que o sistema já foi construído.

Ficha única mantém CPF sem duplicidade, um só acesso ao portal, e todos os
documentos, férias, folgas e pagamentos da pessoa no mesmo lugar, com cada
período identificado pelo seu vínculo. Criar uma segunda ficha para a mesma
pessoa geraria CPF repetido (o próprio sistema bloqueia), dois acessos ao
portal, documentos espalhados e risco de cobrar ou pagar duas vezes.

O problema da Cristiane não é a ficha única: é a cobrança olhar só o vínculo
atual. A correção abaixo faz a cobrança olhar cada vínculo encerrado.

## O que vai mudar

- A cobrança da documentação de desligamento passa a considerar **todo vínculo
  encerrado no histórico da pessoa**, e não apenas a data de desligamento da
  ficha atual. Recontratar deixa de apagar a pendência.
- Para cada vínculo encerrado, a pendência aparece na competência do fim daquele
  vínculo, com o prazo de 10 dias corridos já usado hoje, e o subtítulo passa a
  dizer "vínculo encerrado em 27/08" quando a pessoa já foi recontratada.
- A pendência só surge quando o vínculo encerrado era assalariado (CLT,
  intermitente, temporário, aprendiz) e não era sócio — mesma regra de hoje,
  aplicada ao vínculo que terminou, não ao atual.
- Ao importar o documento de desligamento daquela competência, a pendência sai
  normalmente, como já acontece.
- Quem nunca teve vínculo encerrado, ou já tem o documento importado, não passa
  a ver nada novo. Nada é apagado e nenhum documento é alterado.

Depois do ajuste, a documentação de desligamento da Cristiane volta a aparecer
como pendente na competência 08/2026.

## Detalhes técnicos

- Nenhuma mudança de banco: `dp_colaborador_historico_condicoes` já tem
  `vigencia_inicio`, `vigencia_fim`, `regime` e `modo_continuidade`.
- Em `src/lib/dp/pendencias-documentos.ts`: nova função pura
  `vinculosEncerrados(historico, colaborador)` que devolve
  `{ competencia, dataFim, regime }` unindo os períodos com `vigencia_fim`
  preenchida ao `data_desligamento` atual (sem duplicar a mesma data), e
  `elegivelRescisaoDoVinculo({ regime, vinculo_label })` reaproveitando
  `REGIMES_ASSALARIADOS` + `isSocio`.
- Em `src/hooks/useDpPendencias.tsx`, bloco "5b. Rescisão não importada": carregar
  o histórico da empresa (por `company_id`, apenas linhas com `vigencia_fim`),
  montar mapa `colaborador_id → vínculos encerrados` e gerar a pendência por
  vínculo encerrado, mantendo id estável
  `rescisao-<colaboradorId>-<ano>-<mes>` e a mesma URL de documentos.
- A unidade exibida é a do vínculo encerrado quando houver (`unidade_id` do
  histórico), com fallback para a unidade atual.
- `src/lib/dp/bulk-coverage.ts` (Conferência de Documentos) passa a usar a mesma
  função para saber quem deve ter documento de desligamento na competência, para
  as duas telas não divergirem.
- Testes novos em `src/lib/dp/__tests__/`: vínculo encerrado com recontratação
  posterior continua gerando a cobrança; recontratação como freelancer não anula
  a cobrança do vínculo CLT anterior; vínculo encerrado de sócio ou de regime não
  assalariado não gera cobrança; documento de desligamento importado na
  competência encerra a pendência.
- Verificação: `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json`,
  ESLint, e conferência de leitura na ficha real da Cristiane (somente leitura).
- Nada publicado.
