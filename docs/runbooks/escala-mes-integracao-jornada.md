# Escala do mês × jornada — correção de integração e pendências abertas

Base revisada: `8c71611`. Escopo desta correção: apenas a integração jornada → escala
do mês. Nada de cron legado, nada publicado.

## O que estava errado

1. **Horário próprio do dia era descartado.** `useDpEscalaMes` consultava
   `dp_colaborador_config_dias` só com `dow, trabalha, turno_id, setor_id` e depois
   remontava o dia com três campos. `entrada`, `saida` e `intervalo_minutos` da ficha
   nunca chegavam a `gerarEscalaMes`, então a escala nascia com o horário do turno em
   lugar do horário combinado.
2. **Identificador interno vazando para coluna UUID.** `turnoDoDia` devolvia
   `id: "dia:<dow>"` quando o dia tinha horário próprio sem turno cadastrado, e
   `itemDeTurno` copiava esse valor em `turno_id`. `dp_escala_itens.turno_id` é UUID:
   o dia com horário próprio e sem turno não podia ser gravado.

## Como ficou

- A transformação do hook virou módulo puro: `src/lib/dp/escala-mes-base.ts`
  (`mapearDiasConfig`, `configVigente`, `configParaDominio`,
  `montarColaboradoresEscala`, `itemParaLinha`). O hook só liga consulta e mutação.
- A consulta traz `entrada, saida, intervalo_minutos` e os campos seguem preservados
  até o gerador e até o payload gravado.
- Novo tipo `TurnoDia` (`id: string | null`) separa "turno cadastrado" de "horário que
  vale no dia". Sem turno cadastrado, `turno_id` vai **null** e o horário, a carga e a
  virada de dia continuam gravados. Com turno real, o UUID é preservado; o horário do
  dia continua tendo precedência sobre o do turno.
- `validarEscalaMes` só acusa "sem turno" quando o dia também está sem horário —
  horário próprio sem turno é situação válida.

Cobertura: `src/test/unit/escalaMesJornada.test.ts` percorre consulta → domínio →
geração → payload (horário próprio sem turno, próprio com turno, fallback do turno
padrão, folga, noturno com virada, intervalo, ajuste manual preservado, setor do dia
preservado, alertas).

## Pendências deliberadamente fora desta correção

1. **Regeneração da escala não é atômica.** `gerar` apaga os itens do mês e depois
   insere em lotes de 500 pelo cliente. Uma falha no meio deixa o mês parcialmente
   gravado. Solução correta é uma rotina transacional no banco (delete + insert na
   mesma transação, com trava por escala). Requer migration — não feita aqui.
2. **Vigência por data dentro da competência.** `configVigente` escolhe uma única
   configuração para o mês inteiro (a mais recente que cobre o intervalo). Troca de
   jornada no meio do mês não é respeitada dia a dia. A resolução deveria ser por data
   de cada item.

## Anexo da ficha de registro

O parser `dp-ficha-registro-parse` agrupa páginas por pessoa (`pagina_inicio`/
`pagina_fim`) e **não** grava `arquivo_path` individual: existe um único PDF por lote,
com várias pessoas. Anexar esse arquivo ao cadastro de um colaborador exporia dados de
terceiros. Agora o anexo recorta somente `pagina_inicio..pagina_fim`
(`src/lib/dp/ficha-registro/recortarPaginas.ts` + `anexarFichaRecorte.ts`), com
validação da faixa contra o total de páginas. Faixa ausente ou fora do arquivo → nada
é anexado e o motivo é informado; o cadastro já aplicado permanece válido e nunca é
recriado num retry. O destino é determinístico
(`<empresa>/<colaborador>/ficha-registro-<item>.pdf`), então repetir o anexo não
duplica arquivo nem registro. Cobertura em `src/test/unit/fichaAnexoRecorte.test.ts`,
com PDF sintético de três pessoas reaberto e conferido.
