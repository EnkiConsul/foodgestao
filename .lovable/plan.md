# Folgas automáticas: um único botão, só quem precisa folgar, respeitando o sábado

## O que está errado hoje

Confirmei os três pontos no sistema:

1. **Dois botões para a mesma coisa.** "Gerar folgas CLT" só funciona com uma unidade selecionada e cria folgas de domingo pela leitura legal, ignorando o acordo coletivo da empresa. É um caminho paralelo ao "Distribuir folgas automaticamente".

2. **Entra gente que não precisa folgar.** A geração hoje só exclui sócios pelo rótulo do vínculo. Alessandra, Erildson e Herick são intermitentes e apareceram na lista de sugestões.


3. **A folga da Sara no sábado 12/09 não é contada.** As duas unidades (Pakerê Garavelo e Pakerê T-63) têm acordo coletivo com sábado e domingo como dias de descanso, mas a configuração geral da empresa (usada quando o calendário está em "todas as unidades") está como legal, só domingo. Quando o gestor abre a distribuição sem escolher unidade, o sistema lê a regra da empresa, enxerga só domingo e conclui que a Sara ainda não folgou — por isso sugere um domingo para ela. Escolhendo a unidade, a Sara sai da lista.

## O que vou fazer

**Um único botão, chamado "Gerar Folgas".** Removo "Gerar folgas CLT" do calendário e renomeio "Distribuir folgas automaticamente" para **Gerar Folgas**. Ele segue a regra vigente da unidade: acordo coletivo (sábado e/ou domingo, quantidade por mês) quando houver, ou a leitura legal quando a unidade não tiver acordo.

**Só entra quem precisa folgar no fim de semana.** Ficam fora das sugestões:

- Intermitentes (trabalham por convocação) e sócios.
- Freelancer, PJ, MEI, autônomo, estágio e temporário — vínculos sem folga semanal a cumprir.
- **Quem não trabalha no domingo**, mesmo que a regra da unidade aceite sábado: essa pessoa já descansa todos os domingos, o que atende a CLT e supera a regra da empresa/sindicato.
- Quem não trabalha em nenhum dos dias de descanso da regra da unidade.
- Quem está de férias, licença ou afastado no mês.

Continua possível marcar folga dessas pessoas manualmente no calendário, e essa folga continua ocupando vaga do dia — é justamente o uso atual, para travar o dia dos fixos.



**Regra lida por unidade, não da empresa.** Mesmo com o calendário em "todas as unidades", cada pessoa passa a ser avaliada pela regra da unidade dela: dias de descanso válidos, quantidade exigida no mês e limite de pessoas por dia. Assim a folga da Sara no sábado 12/09 conta e ela não recebe sugestão; o mesmo vale para qualquer pessoa cuja unidade aceite sábado.

**Aviso na tela.** Quando ninguém estiver pendente, a janela explica que todas as folgas do mês já atendem à regra da unidade, em vez de só dizer que nada será criado.

## Detalhes técnicos

- Nova migration (a partir da última existente) reescrevendo `dp_folga_autoatribuicao_plano`, `dp_folga_autoatribuir_aplicar`, `dp_folga_autoatribuicao_previa` e `dp_folga_autoatribuir_competencia` para resolver `dp_folga_dias_fds_aplicaveis` e `folgas_exigidas` **por `colaborador.unidade_id`** (com fallback para a config da empresa quando a pessoa não tem unidade), em vez de uma única resolução pelo parâmetro `_unidade`. Cache por unidade dentro do loop para não repetir chamadas.
- Nova função `public.dp_folga_exige_descanso_fds(_company, _colaborador, _dias, _competencia)` como critério único de elegibilidade, usada pelas quatro rotinas acima: exclui `regime` em (`intermitente`, `pj`, `mei`, `autonomo`, `freelancer`, `estagio`, `temporario`) — apenas os valores existentes no enum `dp_regime_trabalho` —, mantém o filtro de sócio por `vinculo_label`, **exclui quem não trabalha no domingo** (`dow = 0` ausente ou com `trabalha = false` em `dp_colaborador_config_dias`, ou `folga_fixa_dow = 0`), exige interseção entre `_dias` e os dias trabalhados da configuração vigente (`vigencia_fim IS NULL`; sem configuração = elegível) e exclui quem tem férias/licença/afastamento cobrindo o mês.
- `dp_folga_marcadas_no_mes` continua contando folgas efetivadas e pedidos aprovados; recebe os dias já resolvidos por unidade.
- `src/pages/dp/DpFolgas.tsx`: remove o botão e a mutation `gerarFolgasClt` (e o import `Scale` se ficar órfão), renomeia o rótulo do outro botão para "Gerar Folgas" e ajusta o título do diálogo. A RPC `dp_gerar_folgas_clt` permanece no banco, sem uso na interface.

- `src/lib/dp/folga-autoatribuicao.ts`: texto de `resumoPlano` para o caso "nada pendente" citando a regra da unidade.
- Testes: `supabase/tests/dp_folga_autoatribuir_aplicar.test.sql` ganha casos de (a) intermitente/PJ/freelancer fora do plano, (b) pessoa que não trabalha nos dias de descanso fora do plano e (c) folga de sábado contando quando a unidade tem sábado negociado e a empresa não; unitário do novo texto em `src/lib/dp/__tests__/folga-autoatribuicao.test.ts`.
- Verificação com typecheck, lint, vitest, teste de banco em transação com rollback e conferência da tela no navegador com o mês de setembro (esperado: Sara, os três intermitentes e os sócios fora da lista).

