# Sugestão de horário por unidade e cargo

Hoje os atalhos "Copiar o horário de:" no cadastro/edição de colaborador buscam horários de toda a empresa e listam os colegas em ordem cronológica. O ajuste restringe a sugestão à mesma unidade e prioriza os colegas do mesmo cargo, mantendo os nomes nos rótulos.

## O que muda

1. **Só a mesma unidade**
   - Os atalhos passam a usar a unidade selecionada na aba Horário de Trabalho (a mesma já usada para listar os turnos da loja). Sem unidade definida, cai para a empresa como hoje.
   - A sugestão automática de horário para novo colaborador também respeita a unidade.

2. **Mesmo cargo primeiro**
   - A lista de atalhos é ordenada: horários de colegas do mesmo cargo primeiro, depois os demais da unidade; dentro de cada grupo, o mais recente/mais usado à frente.

3. **Rótulo mantém o nome**
   - Os botões de atalho continuam exibindo o nome do colega de referência (ex.: "Cristiane · 17:00→23:00"), apenas a ordem de exibição muda.

4. **Preferência por horários diferentes**
   - Deduplicação por faixa (entrada/saída/intervalo) já existe; a escolha do representante de cada faixa passa a favorecer o mesmo cargo.
   - Limite mantido em 6 atalhos, garantindo variedade de faixas em vez de repetir a mesma.

## Detalhes técnicos

- `src/hooks/useDpModelosHorario.tsx`: já aceita `unidadeId`; passar a unidade efetiva no painel.
- `src/components/dp/ColaboradorJornadaPanel.tsx`:
  - trocar `useDpModelosHorario(null, ...)` por `useDpModelosHorario(unidadeId === "none" ? colaborador?.unidade_id ?? null : unidadeId, ...)`;
  - `atalhosColegas`: ordenar por `cargo_id === colaborador?.cargo_id` antes da dedupe por faixa, mantendo `slice(0, 6)`;
  - rótulo do botão continua com o nome do colaborador + faixa de horário.
- `src/components/dp/CopiarConfigColaboradorDialog.tsx`: ordenar a lista colocando o mesmo cargo primeiro (recebe `cargoId` opcional via props do painel).
- Sem mudanças de banco, de RLS ou de regras de folha.

