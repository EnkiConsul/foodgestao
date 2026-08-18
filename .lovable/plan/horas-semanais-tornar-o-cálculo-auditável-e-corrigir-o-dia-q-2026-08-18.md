# Horas semanais: tornar o cálculo auditável e corrigir o dia que herda o horário base

## O que está acontecendo (confirmado nos dados)

O total não está "somando errado": ele está somando um dia com horário diferente do que você espera.

Rosângela, configuração vigente:

```text
Dom  16:30 → 00:35  (−30 min)   7h35
Seg  17:00 → 00:35  (−30 min)   7h05
Ter  folga                          —
Qua  17:00 → 00:35  (−30 min)   7h05
Qui  (sem horário próprio) → usa o HORÁRIO BASE 17:00 → 00:00   6h30
Sex  16:30 → 00:35  (−30 min)   7h35
Sáb  16:30 → 00:35  (−30 min)   7h35
                                 total 43h24
```

Quinta é o único dia sem horário próprio gravado, então ela herda o horário base da
configuração, que ficou em 17:00 → 00:00 (35 min menor que o horário real da loja).
Se quinta fosse 17:00 → 00:35, o total daria 44h — exatamente a sua conta. Hanna tem o
mesmo horário base defasado, mas todos os dias trabalhados dela têm horário próprio,
então o total dela fecha ~44h.

Ou seja: existem dois problemas de produto, nenhum deles de aritmética.

1. Um dia pode herdar um horário base defasado sem nenhum sinal visual na tela.
2. O total semanal não mostra de onde vem, então a diferença fica invisível.

## O que vamos fazer

1. **Mostrar o horário efetivo de todos os dias.** Hoje o dia sem horário próprio aparece
   "vazio" e silenciosamente usa o base. Passará a exibir o horário que vale para ele com o
   rótulo "usa o horário base", para que um base defasado salte aos olhos.

2. **Detalhamento do total semanal.** Ao clicar em "43h24/semana", abre a quebra por dia
   (dia, faixa, intervalo, horas) e a indicação de qual dia veio do horário base. O total
   fica auditável na própria tela.

3. **Aviso de horário base divergente.** Quando a maioria dos dias trabalhados usa uma faixa
   e o horário base usa outra, mostramos um aviso com ação de um clique:
   "A maioria dos dias vai até 00:35, mas o horário base vai até 00:00 — usar 17:00 → 00:35
   como base?". Aplicar atualiza o base e os dias que herdam dele; nada é alterado sem o
   clique, e o salvamento segue passando pelos alertas legais já existentes.

4. **Somar em minutos, não em horas arredondadas.** Hoje cada dia é arredondado para 2 casas
   antes da soma, o que gera "43h59" onde o correto é "44h". A soma passará a acumular minutos
   e arredondar só no fim.

## Detalhes técnicos

- `src/lib/dp/config-trabalho.ts`: `cargaSemanalConfig` acumula minutos (novo helper
  `cargaSemanalMinutos`) e ganha `detalharCargaSemanal(config, turnos)` devolvendo, por dia,
  turno efetivo, minutos e origem (`proprio` | `base` | `turno_do_dia`). Novo
  `baseDivergenteDosDias(config, turnos)` para o aviso do item 3.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: usa `detalharCargaSemanal` num Popover no
  total semanal; cada linha de dia mostra o horário efetivo e a origem; botão do aviso aplica
  a faixa dominante no `horario` base e nos dias com origem `base`.
- Nenhuma alteração de schema e nenhuma correção automática de dados: os registros atuais só
  mudam se o usuário aceitar o ajuste na tela.
- Testes em `src/test/unit/` para a soma em minutos (44h no caso da Hanna), para o detalhamento
  por dia e para a detecção de base divergente (caso da Rosângela → 43h24 com quinta na base).
