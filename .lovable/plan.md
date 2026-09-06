# Conformidade de DSR — duas análises separadas e três correções

## O que está errado hoje (verificado nos dados)

**1. Nordman aparece "Empresa: em ordem" sem folga de fim de semana**
O cadastro de trabalho dele tem descanso fixo na quarta-feira. A leitura "regra da empresa" está somando qualquer descanso do mês (as 4 quartas) e comparando com o mínimo de "1 folga de fim de semana por mês". Como 4 é maior que 1, ele passa — mesmo sem nenhum sábado ou domingo de folga.

**2. Rosângela aparece "CLT: em ordem" com só um domingo**
Ela tem folga no sábado 05/09 e no domingo 06/09 (pedido aprovado). Como a unidade está em acordo coletivo com sábado e domingo negociados, o sábado está sendo aceito como substituto do segundo domingo. Além disso, a conta hoje é só de quantidade no mês: dois domingos muito próximos (ou muito distantes) passariam igual, mesmo violando o intervalo de 1 domingo a cada 2 semanas.

**3. "(Art. 386 CLT)" ao lado do nome de toda mulher**
O aviso está fixo na coluna do colaborador e no título do detalhe, poluindo a lista.

## O que muda

A tela passa a mostrar **duas análises independentes**, cada uma com seu selo:

**Descanso semanal (DSR)** — verifica se a pessoa nunca fica mais de 6 dias seguidos de trabalho. Monta a sequência de dias do mês a partir do cadastro de trabalho (dias que trabalha, descanso fixo) mais as folgas registradas e os pedidos aprovados, e aponta a maior sequência de trabalho e as datas onde estourou. Inclui alguns dias do fim do mês anterior e do começo do seguinte para não cortar a sequência na virada.

**Descanso no domingo** — verifica o intervalo entre domingos de folga, e não a soma do mês: com regra quinzenal, entre dois domingos folgados não pode haver mais de 1 domingo trabalhado; com a regra de 3 semanas, no máximo 2. O primeiro domingo folgado também é medido a partir do último domingo folgado antes do mês. Mulheres seguem o piso quinzenal do Art. 386 e esse piso só é atendido com domingo de verdade — sábado em acordo coletivo não substitui. Os dias negociados continuam podendo completar o que a regra da unidade pedir além do piso legal.

**Regra da empresa** continua como terceira leitura, mas passa a contar só descansos que valem para a regra: domingo e os dias de descanso negociados da unidade. O descanso fixo do cadastro só entra quando cai num desses dias. Folga em dia comum (quarta, por exemplo) continua visível em "Folgas marcadas", mas não sustenta mais a regra — com isso o Nordman fica "em falta".

**Texto do Art. 386** sai de junto do nome e do título do detalhe. Fica na explicação dentro do detalhe, quando a lei exige mais do que a regra cadastrada, e numa legenda curta no rodapé da tabela.

No detalhe de cada pessoa aparecem os três blocos: descanso semanal (maior sequência de trabalho e datas do estouro), descanso no domingo (domingos folgados, intervalo exigido e onde o intervalo foi rompido) e regra da empresa. Os filtros de situação e a exportação passam a cobrir as três leituras.

## Detalhes técnicos

`src/lib/dp/dsr-rules.ts`:
- nova função `avaliarSequenciaTrabalho({ diasTrabalho, folgas, inicio, fim, maxDiasSeguidos = 6 })` → `{ maiorSequencia, violacoes: { inicio, fim, dias }[] }`;
- nova função `avaliarIntervaloDomingos(domingosFolgados, domingosDoPeriodo, intervaloSemanas, ultimoDomingoAnterior?)` → `{ conforme, maioresIntervalos, domingosEmFalta }`;
- `avaliarConformidade` ganha em `ConformidadeInput`: `diasTrabalhoDow: number[]`, `descansoSemanalElegivelNoMes`, `ultimoDomingoFolgadoAnterior`, `inicio`/`fim` do período; e em `ConformidadeLinha`: `conformeSemanal`, `maiorSequenciaTrabalho`, `violacoesSequencia`, `conformeDomingo`, `intervaloDomingoExigido`, `domingosComIntervaloRompido`;
- `conformeClt` = `conformeSemanal && conformeDomingo` (o piso legal do domingo exige domingos reais);
- `folgasEmpresa` = domingos + dias negociados folgados + descanso fixo em dia elegível; `folgasOutrosDias` deixa de somar na leitura da empresa (segue em `folgasMarcadas`);
- `negociadosAproveitados` passa a preencher só a faixa acima do piso legal.

`src/pages/dp/DpConformidadeDsr.tsx`:
- a consulta passa a trazer os dias de trabalho por colaborador (`dp_colaborador_config_dias`, já carregado), as folgas de uma janela alargada (último domingo do mês anterior até os primeiros dias do mês seguinte) e monta `descansoSemanalElegivelNoMes` filtrando pelos dias elegíveis da config;
- selos por linha: "Semanal", "Domingo", "Empresa"; filtro de situação com essas opções;
- detalhe com os três blocos e as datas de violação; CSV com colunas de maior sequência, intervalo exigido e situação de cada leitura;
- remove `(Art. 386 CLT)` da coluna Colaborador e do título do detalhe; legenda no rodapé da tabela.

`src/lib/dp/__tests__/dsr-rules.test.ts`: 7 dias seguidos de trabalho em falta e 6 em ordem; virada de mês contada corretamente; dois domingos folgados seguidos (06 e 13) não atendem o intervalo quinzenal quando sobra bloco de domingos trabalhados; domingos 06 e 20 em ordem; sábado em acordo não substitui o domingo do piso legal; descanso fixo em dia não elegível não sustenta a regra da empresa. Ajuste dos testes existentes que dependiam das regras antigas.

Sem mudança de banco. Typecheck, lint e vitest rodados, e conferência da tela em Pessoas > Folgas > Conformidade.
