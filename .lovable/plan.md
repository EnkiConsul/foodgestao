# Sugestão de horário por unidade e cargo

Hoje os atalhos "Copiar o horário de:" no cadastro/edição de colaborador buscam horários de toda a empresa e são rotulados com o nome do colega. O ajuste passa a considerar apenas a unidade do colaborador, priorizar quem tem o mesmo cargo e mostrar horários distintos em vez de nomes.

## O que muda

1. **Só a mesma unidade**
   - Os atalhos passam a usar a unidade selecionada na aba Horário de Trabalho (a mesma já usada para listar os turnos da loja). Sem unidade definida, cai para a empresa como hoje.
   - A sugestão automática de horário para novo colaborador também respeita a unidade.

2. **Mesmo cargo primeiro**
   - A lista de atalhos é ordenada: horários de colegas do mesmo cargo primeiro, depois os demais da unidade; dentro de cada grupo, o mais recente/mais usado à frente.

3. **Preferência por horários diferentes**
   - Deduplicação por faixa (entrada/saída/intervalo) já existe; a escolha do representante de cada faixa passa a favorecer o mesmo cargo.
   - Limite mantido em 6 atalhos, garantindo variedade de faixas em vez de repetir a mesma.

4. **Rótulo sem nomes**
   - O botão passa a mostrar a faixa de horário (ex.: `17:00–23:00 · 1h`) com um selo discreto `mesmo cargo` quando aplicável, em vez do primeiro nome do colaborador.
   - O diálogo "Copiar de outro colaborador" continua exibindo nomes (ali a escolha é justamente por pessoa), mas passa a listar os do mesmo cargo primeiro.

## Detalhes técnicos

- `src/hooks/useDpModelosHorario.tsx`: já aceita `unidadeId`; passar a unidade efetiva no painel.
- `src/components/dp/ColaboradorJornadaPanel.tsx`:
  - trocar `useDpModelosHorario(null, ...)` por `useDpModelosHorario(unidadeId === "none" ? colaborador?.unidade_id ?? null : unidadeId, ...)`;
  - `atalhosColegas`: ordenar por `cargo_id === colaborador?.cargo_id` antes da dedupe por faixa, mantendo `slice(0, 6)`;
  - rótulo do botão: `formatarFaixaTurno(m.horario!)` + badge `mesmo cargo`, com `title`/`aria-label` descritivo.
- `src/components/dp/CopiarConfigColaboradorDialog.tsx`: ordenar a lista colocando o mesmo cargo primeiro (recebe `cargoId` opcional via props do painel).
- Sem mudanças de banco, de RLS ou de regras de folha.
