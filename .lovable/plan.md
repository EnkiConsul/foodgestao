# Conformidade CLT: domingo quinzenal para mulheres

## O que está acontecendo

Na unidade Pakerê T-63 a regra de folga dominical está cadastrada como "1 folga de fim de semana por mês", tanto para o geral quanto para as mulheres. A tela de Conformidade usa exatamente esse número como mínimo, então uma colaboradora com 1 domingo de folga no mês aparece como "em ordem" na leitura CLT.

O Art. 386 da CLT exige revezamento quinzenal para mulheres: ao menos 1 domingo de folga a cada 2 semanas. Em um mês com 4 domingos, isso são 2 domingos. Hoje esse piso legal não é aplicado na avaliação — ele só existe como referência na tela de configuração.

## O que muda

- A leitura CLT passa a ter dois mínimos separados:
  - mínimo da regra da empresa (o que está configurado na unidade);
  - mínimo legal, que para colaboradoras do sexo feminino nunca fica abaixo de 1 domingo a cada 2 semanas (metade dos domingos do mês, arredondado para baixo).
- Uma mulher só fica "em ordem" na CLT se atingir o mínimo legal quinzenal. Homens seguem o mínimo da regra configurada (com o piso legal do setor já existente, quando aplicável).
- A tela mostra o mínimo legal ao lado do mínimo da regra e, no detalhe, uma linha explicando a origem ("Art. 386 da CLT — 1 domingo a cada 2 semanas"), para o gestor entender por que o número é maior do que o cadastrado.
- O arquivo exportado passa a trazer as duas colunas de mínimo (regra e legal).
- A leitura da empresa continua como está hoje: usa o mínimo cadastrado e aceita qualquer dia de descanso.

Nenhuma mudança no banco e nenhuma alteração na regra que o colaborador vê para marcar folgas — só na avaliação de conformidade.

## Detalhes técnicos

- `src/lib/dp/dsr-rules.ts`
  - nova função `minimoLegalDomingos(domingosNoPeriodo, { sexo, setorComercio })`: para `sexo === "F"` retorna `floor(domingos / PADRAO_LEGAL_DOMINGO_MULHER)`; caso contrário `floor(domingos / padraoLegalDomingo(setorComercio))`.
  - `ConformidadeLinha` ganha `esperadoClt` (= `max(esperado da regra, mínimo legal)`) e `esperadoLegal`; `esperado` permanece como mínimo da regra (usado na leitura da empresa) para não quebrar chamadas existentes.
  - `conformeClt` passa a comparar `folgasConsideradas >= esperadoClt`; `conformeEmpresa` e `conforme` seguem usando `esperado`.
  - `avaliarConformidade` recebe `setor_comercio` de `cfg` (já é `Partial<DpConfigDp>`; hoje é forçado `true` na chamada interna a `semanasDaConfig`) e passa o valor real ao piso legal.
- `src/pages/dp/DpConformidadeDsr.tsx`: exibe `esperadoClt` no selo/detalhe da leitura CLT, mantém `esperado` na leitura da empresa, adiciona a nota do Art. 386 quando `esperadoClt > esperado` e inclui as colunas no CSV. O tipo `cfg` passado precisa incluir `setor_comercio`.
- `src/lib/dp/__tests__/dsr-rules.test.ts`: casos novos — mulher com 1 domingo em mês de 4 domingos e regra "1 por mês" fica em falta na CLT; mulher com 2 domingos fica em ordem; homem com 1 domingo na mesma regra continua em ordem; mês de 5 domingos exige 2; acordo coletivo com dias negociados complementando o mínimo legal.
- Rodar typecheck (`bunx tsgo --noEmit -p tsconfig.app.json`), lint e vitest, e conferir a tela em setembro/2026.
