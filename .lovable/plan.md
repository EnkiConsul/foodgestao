# Conformidade de DSR dominical — correções

A tela avalia só a folga dominical, em duas leituras: exigência da CLT e regra da empresa. O descanso semanal comum (não trabalhar mais de 6 dias seguidos) fica fora — já é validado no cadastro do turno.

## O que está errado hoje (verificado nos dados)

**1. Nordman aparece "Empresa: em ordem" sem folga de fim de semana**
O cadastro de trabalho dele tem descanso fixo na quarta-feira. A leitura da regra da empresa está somando qualquer descanso do mês (as 4 quartas) e comparando com o mínimo de "1 folga de fim de semana por mês". Como 4 é maior que 1, ele passa — mesmo sem nenhum sábado ou domingo de folga.

**2. Rosângela aparece "CLT: em ordem" com só um domingo**
Ela tem folga no sábado 05/09 e no domingo 06/09 (pedido aprovado). Como a unidade está em acordo coletivo com sábado e domingo negociados, o sábado está sendo aceito como substituto do segundo domingo. Além disso a conta hoje é só de quantidade no mês: dois domingos muito próximos passariam igual, mesmo rompendo o intervalo de 1 domingo a cada 2 semanas.

**3. "(Art. 386 CLT)" ao lado do nome de toda mulher**
O aviso está fixo na coluna do colaborador e no título do detalhe, poluindo a lista.

## O que muda

**Leitura da CLT** passa a medir o intervalo entre domingos de folga, e não a soma do mês: com regra quinzenal, entre dois domingos folgados não pode haver mais de 1 domingo trabalhado; com a regra de 3 semanas, no máximo 2. O primeiro domingo do mês é medido a partir do último domingo folgado antes do mês, para não punir a virada. Mulheres seguem o piso quinzenal do Art. 386, e esse piso só é atendido com domingo de verdade — sábado em acordo coletivo não substitui. Os dias negociados continuam podendo completar o que a regra da unidade pedir acima do piso legal.

**Leitura da regra da empresa** passa a contar só descansos que valem para a regra: domingo e os dias de descanso negociados da unidade. O descanso fixo do cadastro só entra quando cai num desses dias. Folga em dia comum (quarta, por exemplo) continua visível em "Folgas marcadas", mas não sustenta mais a regra — com isso o Nordman fica "em falta".

**Texto do Art. 386** sai de junto do nome e do título do detalhe. Fica na explicação dentro do detalhe, quando a lei exige mais do que a regra cadastrada, e numa legenda curta no rodapé da tabela.

No detalhe de cada pessoa: domingos folgados, intervalo exigido, onde o intervalo foi rompido, e o bloco da regra da empresa com o que foi considerado. Filtros de situação e exportação seguem com as duas leituras.

## Detalhes técnicos

`src/lib/dp/dsr-rules.ts`:
- nova função `avaliarIntervaloDomingos(domingosFolgados, domingosDoPeriodo, intervaloSemanas, ultimoDomingoFolgadoAnterior?)` → `{ conforme, domingosComIntervaloRompido, maiorIntervalo }`;
- `ConformidadeInput` ganha `descansoSemanalElegivelNoMes`, `domingosDoPeriodo: string[]` (datas) e `ultimoDomingoFolgadoAnterior?: string`;
- `ConformidadeLinha` ganha `intervaloDomingoExigido`, `domingosComIntervaloRompido`, além de `esperadoLegal`/`esperadoClt` já existentes;
- `conformeClt` = intervalo dos domingos respeitado **e** `folgasConsideradas >= esperadoClt`, com o piso legal (`esperadoLegal`) exigindo domingos reais;
- `folgasEmpresa` = domingos + dias negociados folgados + descanso fixo em dia elegível; `folgasOutrosDias` deixa de somar na leitura da empresa (segue em `folgasMarcadas`);
- `negociadosAproveitados` passa a preencher só a faixa acima do piso legal.

`src/pages/dp/DpConformidadeDsr.tsx`:
- a consulta busca também as folgas/pedidos aprovados anteriores ao mês para achar o último domingo folgado, e monta `descansoSemanalElegivelNoMes` filtrando `dowsDescanso` pelos dias elegíveis da config;
- detalhe mostra intervalo exigido e as datas onde o intervalo foi rompido; CSV ganha "Intervalo exigido (semanas)" e "Domingos fora do intervalo";
- remove `(Art. 386 CLT)` da coluna Colaborador e do título do detalhe; legenda no rodapé da tabela;
- ajusta o texto do bloco "Regra da empresa" para explicar que conta domingo, dias negociados e o descanso fixo quando cai nesses dias.

`src/lib/dp/__tests__/dsr-rules.test.ts`: domingos 06 e 13 com bloco de domingos trabalhados depois ficam em falta no intervalo quinzenal; domingos 06 e 20 em ordem; último domingo do mês anterior evita falso positivo na virada; sábado em acordo não substitui o domingo do piso legal; descanso fixo em dia não elegível não sustenta a regra da empresa. Ajuste dos testes existentes que dependiam das regras antigas.

Sem mudança de banco. Typecheck, lint e vitest rodados, e conferência da tela em Pessoas > Folgas > Conformidade.
