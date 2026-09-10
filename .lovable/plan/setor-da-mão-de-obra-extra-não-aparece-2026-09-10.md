# Setor da mão de obra extra não aparece

## O que está acontecendo

O setor que você escolhe na mão de obra extra **está sendo salvo** no banco. Confirmado: o registro da Hanna (10/09) está gravado com o setor PRODUÇÃO.

O problema é na exibição: quando a pessoa da mão de obra extra é um colaborador já cadastrado (tipo "Colaborador"), a rotina do dia continua mostrando o setor do cadastro/escala dela e ignora o setor definido só para aquele dia. Por isso parece que nada foi salvo — ao reabrir a tela e ao agrupar por setor, ela aparece no setor antigo.

Para folguistas e pessoas em teste o setor do dia já é respeitado; só o caso do colaborador cadastrado ficou de fora.

## O que vai mudar

- Na rotina do dia, quando existir um registro de mão de obra extra do colaborador naquela data, o setor mostrado passa a ser o setor daquele registro.
- Isso vale para a lista de pessoas, o agrupamento por setor, o detalhe do dia e a etiqueta que indica que o setor do dia é diferente do habitual.
- Sem esse registro, nada muda: continua valendo escala → dia da semana → setor habitual.
- Alterar o setor pelo atalho da própria linha na rotina continua funcionando e agora reflete na hora.

Nenhuma regra de permissão, salvamento ou cálculo de horas é alterada.

## Detalhes técnicos

- `src/lib/dp/operacao-panorama.ts`: no ramo de `registro_manual` (por volta da linha 504), passar o `setor_id` do registro avulso como sobreposição do setor efetivo; estender o parâmetro `extras` de `registrar` com `setor_id` e usá-lo em `setor_id` / `setor_nome` / `setor_origem` quando presente (origem "escala"), mantendo `setor_habitual_*` do cadastro.
- Garantir que o tipo do registro manual carregado (`AvulsoPanorama`) mantenha `setor_id` até esse ponto — o hook `useDpOperacaoPanorama` já traz o campo.
- Testes em `src/lib/dp/__tests__` cobrindo: registro manual com setor definido sobrepõe cadastro; sem setor definido mantém o comportamento atual; agrupamento por setor usa o setor do dia.
