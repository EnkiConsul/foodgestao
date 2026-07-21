## Diagnóstico confirmado

A inconsistência está na rota atual do menu **Calendário Geral**:

- O menu abre `/dp/folgas/calendario`.
- Essa rota renderiza `DpFolgas`, não `DpAdminCalendario`.
- `DpAdminCalendario` já usa a lógica nova (`buildOccupantsByDate`) que considera `folga_fixa_semana`.
- `DpFolgas` ainda monta o calendário antigo a partir de apenas:
  - `dp_solicitacoes`
  - `dp_folgas`
- Por isso as folgas fixas semanais cadastradas em `dp_colaboradores.folga_fixa_semana` não aparecem nesse calendário.
- Confirmei no banco que existem colaboradores ativos com `folga_fixa_semana` preenchido.

## Plano de correção

1. **Atualizar o Calendário Geral (`/dp/folgas/calendario`)**
   - Incluir colaboradores ativos com `folga_fixa_semana` no cálculo de eventos do calendário.
   - Criar eventos sintéticos de “Folga Semanal” para cada dia do mês/grade em que `dia.getDay()` corresponde ao valor salvo no colaborador.

2. **Respeitar os filtros existentes**
   - Unidade: exibir só colaboradores da unidade selecionada.
   - Colaborador: exibir só o colaborador selecionado.
   - Tipo: exibir folgas semanais quando o filtro estiver em `todos` ou `folga`.

3. **Evitar duplicidade visual**
   - Se o colaborador já tiver uma folga registrada no mesmo dia via `dp_folgas` ou solicitação aprovada de folga, não duplicar o chip semanal.

4. **Ajustar contadores do dia**
   - O contador `ocupado/capacidade` também deve somar as folgas semanais fixas, para refletir a ocupação real do dia.

5. **Padronizar visualmente**
   - Manter a legenda “Folga Semanal”.
   - Exibir chips semanais com o padrão azul já usado na legenda.
   - Preservar o comportamento atual para férias, atestados, solicitações pendentes e folgas mensais.

## Arquivo principal a alterar

- `src/pages/dp/DpFolgas.tsx`

## Validação

- Abrir `/dp/folgas/calendario`.
- Conferir se colaboradores com `folga_fixa_semana` aparecem nos dias corretos da semana.
- Testar filtros de unidade, colaborador e tipo.
- Confirmar que não há duplicidade quando já existe folga efetivada no mesmo dia.