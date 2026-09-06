# Conformidade de DSR — três correções

## O que está errado hoje (verificado nos dados)

**1. Nordman aparece "Empresa: em ordem" sem folga de fim de semana**
O cadastro de trabalho dele tem descanso fixo na quarta-feira. A leitura "regra da empresa" está somando qualquer descanso do mês (as 4 quartas) e comparando com o mínimo de "1 folga de fim de semana por mês". Como 4 é maior que 1, ele passa — mesmo sem nenhum sábado ou domingo de folga.

**2. Rosângela aparece "CLT: em ordem" com só um domingo**
Ela tem folga no sábado 05/09 e no domingo 06/09 (pedido aprovado). Como a unidade está em acordo coletivo com sábado e domingo negociados, o sábado está sendo aceito como substituto do segundo domingo, e ela fecha os 2 exigidos. Só que o piso do Art. 386 é de domingo — sábado não substitui.

**3. "(Art. 386 CLT)" ao lado do nome de toda mulher**
O aviso está fixo na coluna do colaborador e no título do detalhe, poluindo a lista.

## O que muda

**Leitura da regra da empresa**: passa a contar só descansos que valem como folga da regra — domingo e os dias de descanso negociados da unidade. O descanso fixo do cadastro só entra quando cai num desses dias. Folga em dia comum (quarta, por exemplo) continua aparecendo em "Folgas marcadas", mas não sustenta mais a regra. Com isso o Nordman fica "em falta" na empresa.

**Leitura da CLT**: o piso legal (1 domingo a cada 2 semanas para mulheres; padrão do setor nos demais) tem de ser atendido com domingos de verdade. Os dias negociados continuam podendo completar o que a regra da unidade pede além do piso. Com isso a Rosângela fica "em falta" na CLT até ter um segundo domingo.

**Texto do Art. 386**: sai de junto do nome e do título do detalhe. Fica só na explicação dentro do detalhe, quando a lei realmente exige mais do que a regra cadastrada, e numa legenda curta no rodapé da tabela.

## Detalhes técnicos

`src/lib/dp/dsr-rules.ts` (`avaliarConformidade`):
- `folgasEmpresa` = domingos + dias negociados folgados + descanso fixo em dia elegível. Novo campo de entrada `descansoSemanalElegivelNoMes`; `folgasOutrosDias` deixa de somar na leitura da empresa (segue em `folgasMarcadas`).
- `conformeClt` = `domingos >= esperadoLegal` **e** `folgasConsideradas >= esperadoClt`.
- `negociadosAproveitados` passa a preencher só a faixa acima do piso legal: `min(negociados, max(0, esperadoClt - max(domingos, esperadoLegal)))` — mantendo o cap atual quando não há piso legal maior.

`src/pages/dp/DpConformidadeDsr.tsx`:
- calcula `descansoSemanalElegivelNoMes` filtrando `dowsDescanso` pelos dias elegíveis da config (`diasElegiveisDaConfig`), e mantém `descansoSemanalNoMes` só para exibição;
- remove `(Art. 386 CLT)` da coluna Colaborador e do título do detalhe; adiciona legenda no rodapé da tabela;
- ajusta o texto do bloco "Regra da empresa" para explicar que conta só sábado/domingo (ou os dias negociados) e o descanso fixo quando cai nesses dias.

`src/lib/dp/__tests__/dsr-rules.test.ts`: casos novos — descanso fixo em dia não elegível não sustenta a regra da empresa; mulher com 1 domingo + 1 sábado em acordo coletivo fica em falta na CLT; mulher com 2 domingos em ordem; homem com 1 domingo + sábado em ordem. Ajuste dos testes existentes que dependiam do descanso fixo em dia comum.

Sem mudança de banco. Typecheck, lint e vitest rodados, e conferência da tela em Pessoas > Folgas > Conformidade.
