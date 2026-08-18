# O aviso "pouca folga até o limite de 44h" está confuso

Esse aviso não fala de folga (dia de descanso). Ele é sobre a **carga semanal**: a soma das horas dos dias marcados como trabalho. A regra atual avisa quando a soma passa de 40h e ainda não passou de 44h — e usa a palavra "folga" no sentido de "margem", o que no contexto do DP se confunde com o dia de descanso.

No caso da Sara, a jornada soma exatamente **44h**, ou seja, ela está **no teto da CLT**, sem nenhuma margem. Dizer "pouca folga até o limite de 44h" quando a carga já é 44h está errado em dois sentidos: a palavra e o fato.

## O que vamos mudar

Só o texto e o corte da mensagem (nenhuma regra de bloqueio muda):

- **Carga exatamente no limite (44h)**: aviso passa a dizer que está no teto legal, com a leitura correta — "Carga semanal de 44h: é o teto da CLT. Qualquer hora além disso vira hora extra."
- **Carga entre 40h e 44h**: mostra a margem em horas, sem a palavra "folga" — "Carga semanal de 42h: faltam 2h para o teto semanal da CLT (44h)."
- **Carga acima de 44h** (erro, hoje já existe): mantém o bloqueio, com texto explicando o excedente — "Carga semanal de 46h excede o teto da CLT (44h) em 2h."
- Nos três casos, o rótulo do bloco de avisos deixa claro que se trata de horas por semana, não de dia de descanso.

## Detalhes técnicos

- `src/lib/dp/validarConfigTrabalho` em `src/lib/dp/config-trabalho.ts`: reescrever as mensagens do bloco `policy.validaCargaSemanal` (linhas 265-280), separando o caso `carga === LIMITE_SEMANAL` do caso `carga > LIMITE_SEMANAL - 4`, e calculando a margem/excedente com `formatarHoras`.
- Testes em `src/test/unit/` cobrindo os três casos (43h, 44h, 46h) para travar a redação e os cortes.
- Nenhuma mudança em banco, em `configTemErro` ou na validação de folga semanal.
