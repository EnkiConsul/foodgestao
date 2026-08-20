# Adicional por tempo de serviço: escada ou cumulativo, por empresa

## Por que a Cristiane caiu no triênio (confirmado nos dados)

Existem **duas regras cadastradas com o mesmo escopo (toda a empresa) e a mesma vigência (01/01/2026)**:

- Ciclo de 36 meses (triênio), 3% por ciclo, não acumula
- Ciclo de 60 meses (quinquênio), 5% por ciclo, não acumula

A Cristiane foi admitida em 01/04/2017 (mais de 9 anos de casa), então ela atende às duas.

Hoje o sistema escolhe **uma única regra**: a mais específica e, no empate, a de vigência mais recente. Como escopo e vigência são idênticos, não há critério de desempate — vence a que vier primeiro na lista, que por acaso é o triênio. Não é erro no cálculo de tempo de casa: é ambiguidade entre regras concorrentes.

## O que será construído

Na própria tela de Adicionais por tempo de serviço, a empresa escolhe como as regras concorrentes se comportam:

- **Escada (padrão, caso da Pakerê):** o degrau mais alto já alcançado substitui os anteriores. Cristiane com 9 anos passa a receber o quinquênio (5%); quem tem 4 anos fica no triênio (3%); quem tem 2 anos não recebe nada.
- **Cumulativo:** todas as regras vigentes com ciclo completo somam. Cristiane somaria 3 triênios (conforme o "acumula" de cada regra) mais o quinquênio, e o card mostra a composição linha por linha.

Detalhes da tela:

- Um seletor no topo da tela, com as duas opções explicadas em uma linha cada e efeito imediato em todos os cálculos da empresa.
- Prévia do efeito ao lado do seletor: exemplo com tempo de casa de 3, 5 e 9 anos, mostrando o percentual resultante em cada modo — o gestor confere antes de salvar.
- Aviso quando existirem regras vigentes de mesmo escopo, dizendo qual modo está ativo e como elas serão combinadas.
- O modo é por empresa (fica junto das configurações do Pessoas 360°, com o "Aplicar na folha" que já existe), e vale para todos os escopos de regra.

Na ficha do colaborador, o card passa a dizer qual regra (ou combinação) foi aplicada e por quê: "Quinquênio — 1x 5% (9 anos de casa)" no modo escada, ou a soma detalhada no modo cumulativo. Sem nenhum ciclo completo, mantém a mensagem discreta de "não atende aos critérios".

Folha, holerite e relatórios usam o mesmo resultado, sem rubrica nova.

## Detalhes técnicos

- Banco: nova coluna `adicional_tempo_servico_modo` em `dp_config_dp` (`escada|cumulativo`, default `escada`), herdada por unidade como as demais configs. Sem outras mudanças de schema.
- `src/lib/dp/tempoServico.ts`:
  - `selecionarRegraTempoServico` passa a receber a admissão e a referência: entre candidatas de mesmo peso de escopo, prefere a de maior `ciclo_meses` **com ao menos um ciclo completo**; sem nenhuma completa, devolve a de menor `ciclo_meses` (só para a mensagem de "ainda não atende").
  - nova `calcularAdicionalPorModo({ regras, alvo, admissao, referencia, base, pisoCargo, modo })` retornando `{ percentual, valor, itens: AdicionalCalculado[] }` — no modo escada, `itens` tem um elemento; no cumulativo, um por regra com ciclo completo, respeitando `acumula` e `max_ciclos` de cada uma.
- `src/hooks/useDpSalarioFamiliaConfig.tsx` (onde vive `adicionalAtivo`) expõe e grava o novo modo.
- `src/pages/dp/DpAdicionaisTempoServico.tsx`: seletor de modo, prévia 3/5/9 anos e aviso de regras concorrentes.
- `src/components/dp/AdicionalTempoServicoCard.tsx`: usa `calcularAdicionalPorModo` e mostra a composição quando houver mais de um item.
- Consumidores da folha/apuração que chamam `selecionarRegraTempoServico` migram para `calcularAdicionalPorModo` (buscar todas as referências).
- Testes em `src/lib/dp/__tests__/tempoServico.test.ts`: duas regras 36/60 mesmo escopo e vigência — escada com 9 anos → 5%; escada com 4 anos → 3%; cumulativo com 9 anos → soma dos dois; 1 ano → sem adicional nos dois modos; `max_ciclos` respeitado no cumulativo.
