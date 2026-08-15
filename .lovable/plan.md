# Tudo pelo cadastro do colaborador — sem falar "turno"

O usuário é o dono da loja, não um analista de DP. Ele pensa em "quem trabalha, em que horário e quando folga". Então o cadastro do colaborador passa a ser o único lugar necessário, e a palavra "turno" sai da frente dele.

## O que ele passa a ver

Na aba "Turno & Jornada" do colaborador — renomeada para **"Horário de trabalho"**:

1. **Horário** — entrada, saída e intervalo direto na tela, com atalhos prontos da loja ("Almoço 10:00–16:00", "Jantar 17:00–23:00") sugeridos a partir dos horários que já existem na unidade. Escolher um atalho preenche os campos; digitar outro horário também funciona, sem passar por nenhum cadastro.
2. **Dias e folga** — sete switches da semana. Dia desmarcado = folga, e o texto abaixo confirma ("Folga: quarta-feira"), com a opção "folga varia conforme a escala". Atalhos 6x1 e 5x2 continuam.
3. **Horário diferente em algum dia** — botão discreto por dia ("sábado tem horário diferente") que abre entrada/saída/intervalo daquele dia.
4. **Copiar de outro colaborador** — para cadastrar o segundo, terceiro e o resto em segundos.

Nada disso obriga o usuário a abrir outra tela. Ele nunca precisa saber que existe uma tabela de turnos.

## O que acontece por trás

- Quando o horário digitado é igual a um horário já usado na unidade, o sistema **reaproveita** esse modelo em silêncio. Quando é novo, cria o modelo automaticamente com nome derivado do horário ("17:00–23:00"), sem pedir nada.
- Um horário específico de um único dia **não** cria modelo: fica gravado no próprio dia do colaborador, como exceção.
- Resultado: o cadastro de horários da loja cresce só quando existe de fato um horário novo — e é o mesmo modelo compartilhado por todos que trabalham nele.

### Por que não criar um modelo por colaborador
Um modelo por pessoa quebra coisas que o empresário usa sem saber: a cobertura mínima por horário ("preciso de 2 no jantar"), as colunas da Operação do Dia, os relatórios que agrupam por horário e, no futuro, adicional noturno e tolerância de ponto — que são regras do horário, não da pessoa. Além disso, mudar o jantar de 17h para 18h passaria a ser 40 edições em vez de uma.

### E a tela "Turnos"
Sai do menu principal e passa a viver como tela avançada em Cadastros, renomeada **"Horários da loja"** — para quem quiser ajustar cobertura mínima ou corrigir um horário de todos de uma vez. Deixa de ser passo obrigatório.

## Corrigir um horário depois: quem é afetado

Hoje a tela de turno não mostra quem usa aquele horário, e a escolha ao editar é apenas "aplicar às novas escalas" ou "criar nova versão". Passa a ficar assim:

- **Cada horário mostra quem trabalha nele.** No card de "Horários da loja" aparece a contagem ("6 colaboradores") e, ao abrir, a lista com nome, cargo e dias. O mesmo bloco aparece dentro da edição, antes de salvar.
- **Ao salvar uma alteração de horário, o usuário escolhe o alcance:**
  - *Todos os que usam este horário* (padrão) — uma edição, todos passam a seguir o horário novo.
  - *Somente alguns* — marca os colaboradores na lista; os marcados continuam no horário novo e os não marcados são movidos para um horário com os valores antigos (reaproveitando um equivalente se existir, ou criado automaticamente), então ninguém tem a jornada alterada sem intenção.
- **Escalas já publicadas nunca mudam.** A escala congela entrada/saída no item, então mês fechado, Ponto e Folha continuam com os números originais. A alteração vale da data escolhida em diante (padrão: hoje).
- **Excluir/inativar um horário em uso passa a avisar quem ficará sem horário**, com a lista nominal, em vez do texto genérico atual.

## Alertas trabalhistas (avisa, não bloqueia)

Hoje a regra "menor não encerra após as 22:00" existe em `validarSemana` (`src/lib/dp/jornada-utils.ts`), mas o único componente que a usava (`HorariosSemanaEditor`) não é mais chamado por nenhuma tela — logo, no cadastro atual do colaborador nada é sinalizado. O ajuste transforma isso num verificador que roda no próprio "Horário de trabalho" do colaborador:

- **Faixa amarela de avisos abaixo dos horários**, em linguagem de dono de loja, atualizada enquanto ele digita. Nada trava o salvamento.
- **Ao salvar com algum aviso aberto**, aparece o `CienciaLegalDialog` já usado no projeto: lista dos pontos fora da referência CLT, checkbox de ciência e justificativa opcional, com registro em `dp_regras_historico` (quem confirmou, quando, o que).
- Regras verificadas, todas derivadas da idade/cargo/regime já cadastrados:
  - **Menor de 18**: nenhum horário depois das 22:00 nem virando o dia; máximo 6h por dia e 30h na semana (8h/44h só com curso e compensação); intervalo de 1h quando passa de 4h; nada de domingo/feriado sem folga compensatória.
  - **Todos**: mais de 44h na semana; mais de 8h no dia sem acordo de compensação; intervalo menor que 1h em jornada acima de 6h (já existe) e ausência de intervalo acima de 4h; menos de 11h entre a saída de um dia e a entrada do seguinte; 7 dias seguidos sem folga; domingo sem folga no mês.
  - **Aprendiz**: 6h/dia sem prorrogação.
  - **Noturno (22h–5h)**: aviso informativo de que a hora vale 52min30 e há adicional de 20% — para a Folha calcular certo depois.
- **Onde mais aparece**: o mesmo verificador é reaproveitado na ficha do colaborador (selo "Fora da referência CLT" com o motivo), no cadastro de "Horários da loja" e na geração da escala do mês (aviso na publicação, sem impedir).
- A chave `exige_validacao_menor` já existente em `dp_config_dp` passa a significar "avisar sobre menores" — o texto do card em Configurações é corrigido, pois hoje promete bloqueio que não existe.


## Detalhes técnicos

- Migração: `entrada`, `saida`, `intervalo_minutos` (nulos) em `dp_colaborador_config_dias`, com check de coerência (os três juntos ou nenhum).
- `src/lib/dp/config-trabalho.ts`: `DiaConfig` ganha campos de horário; `turnoDoDia` devolve horário resolvido priorizando o override do dia; nova `folgaFixaDerivada(dias)`; `validarConfigTrabalho` olha `dias` em vez de `folga_fixa_dow`.
- Novo helper `src/lib/dp/turno-resolver.ts`: dado horário + unidade, encontra turno equivalente (entrada/saída/intervalo iguais) ou monta o payload de criação automática com nome derivado. Testado isoladamente.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: campos de horário no lugar do seletor de turno, atalhos vindos dos turnos da unidade, overrides por dia dentro do estado `dias`, remoção de `VIRTUAL_PREFIX`/`resolverDias` e do seletor de dia de folga; textos sem a palavra "turno".
- `src/hooks/useDpColaboradorConfigTrabalho.tsx`: resolver/criar o turno da unidade no salvamento, persistir horários por dia e derivar `folga_fixa_dow`.
- `src/lib/dp/escala-mes.ts`, `src/lib/dp/horario-previsto.ts`, `src/lib/dp/operacao-dia.ts`, `src/hooks/useDpEscalaMes.tsx`: propagar o horário do dia na resolução do previsto (escala continua congelando entrada/saída no item, então Ponto e Folha leem as mesmas horas).
- `src/config/dpNavigation.tsx`: `/dp/cadastros/turnos` renomeado para "Horários da loja" e movido para o fim do grupo Cadastros.
- `src/components/dp/CopiarConfigColaboradorDialog.tsx`: copiar também as exceções de horário.
- Novo `src/hooks/useDpTurnoVinculos.tsx`: colaboradores com configuração vigente apontando para o turno (via `dp_colaborador_config_trabalho` + `dp_colaborador_config_dias`), com nome e cargo.
- Novo `src/components/dp/TurnoAlcanceDialog.tsx` (padrão do `ReplicarRegrasDialog`): escolha entre "todos" e "somente alguns" + data de início; ao aplicar parcialmente, repõe o horário antigo nos não marcados via o resolver.
- `src/pages/dp/cadastros/DpTurnos.tsx` e `src/components/dp/TurnoCard.tsx`: contagem/lista de vinculados no card, no formulário e no diálogo de exclusão.
- Testes: estender `config-trabalho.test.ts`, `escala-mes.test.ts`, `horario-previsto.test.ts`, criar teste do resolver (reaproveita vs cria) e do cálculo de alcance (quem permanece, quem é movido).
