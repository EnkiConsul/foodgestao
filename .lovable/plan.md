## Problema

No Calendário Geral (`/dp/folgas/calendario` → `src/pages/dp/DpFolgas.tsx`), o dialog do dia usa o componente enxuto `DpCalendarDayDialog`, com o motivo do bloqueio apenas em `footerExtra`. Não há botão "Liberar Data", nem bloco "Configuração do dia" (limite de colaboradores para FDS), nem a apresentação em card vermelho com badge Automático/Manual conforme a versão do GitHub e o print enviado.

A versão correta já existe em `src/pages/dp/DpAdminCalendario.tsx` (linhas 702–840): card "DATA BLOQUEADA" com motivo + `Liberar Data`, "Configuração do Dia" com `Limite de colaboradores` + Salvar, "Escala do dia", "Atribuir folga manual" e "Fechar detalhes".

## Plano

Alinhar o dialog do dia do Calendário Geral com o do Admin, reutilizando a mesma UI/comportamento.

1. **Trocar `DpCalendarDayDialog` por Dialog inline** em `src/pages/dp/DpFolgas.tsx`, replicando a estrutura de `DpAdminCalendario`:
   - Header com ícone + `dd/MM/yyyy`.
   - Bloco `DATA BLOQUEADA` (fundo `bg-destructive/10`, badge Automático/Manual, ícone `Lock`, `AlertTriangle`, motivo, botão `Liberar Data`) — só quando `blockedByDate.get(iso)` existir.
   - Bloco `Configuração do Dia` — só quando o dia for fim de semana (mesma regra do admin), com input `Limite de colaboradores` + `Salvar`, alimentado por `dp_folga_dia_config`.
   - Bloco `Escala do dia` reaproveitando `selectedEvents` já calculado (usar o mesmo layout do admin: bolinha colorida por tipo + nome + origem; remover folga mensal com botão `Trash2`).
   - Bloco `Atribuir folga manual` com `Select` + `Atribuir` (usa `quickAssign` já existente) e link secundário "Solicitar ausência avançada".
   - Rodapé `Fechar detalhes`.

2. **Novas mutations/queries em `DpFolgas.tsx`** (espelhando `DpAdminCalendario`):
   - `liberarData`: `upsert` em `dp_datas_bloqueadas` com `liberada: true` para `{company_id, data}` do dia selecionado; invalida `dp_datas_bloqueadas_geral` e `dp_bloq_regras_geral`.
   - `diaConfigQuery` (se ainda não existir para o dia) + `salvarLimite`: `upsert` em `dp_folga_dia_config` com `{company_id, data, limite}`; invalida `dp_folga_dia_config_*` e recarrega `capacityByDay`.
   - `removerFolga`: `delete` em `dp_folgas` por `id` (para o Trash2 na escala), com invalidação das queries de folgas do calendário.
   - Reaproveita `quickAssign` (já implementado).

3. **Manter escopo apenas no admin**: renderizar os blocos "Data Bloqueada" e "Configuração do Dia" somente quando o usuário for admin da empresa (checar flag já usada na página; se não existir, usar `useCompanyPermissions`). Colaboradores não devem ver "Liberar Data".

4. **Estado local do dialog**: adicionar `editLimit` (número) sincronizado ao abrir o dia; `assignUser` já mapeado em `quickColabId`.

5. **Sem alterações de banco**: schema e triggers já foram atualizados anteriormente (`dp_datas_bloqueadas.liberada`, `dp_folga_dia_config`, `dp_regra_bloqueia_data`).

## Verificação

- Abrir `/dp/folgas/calendario` como admin em agosto/2026 e clicar em **08/08**: dialog exibe card vermelho "DATA BLOQUEADA · AUTOMÁTICO" com motivo "Bloqueio Pós-Pagamento (FDS após dia 5) - Sábado" e botão "Liberar Data" (paridade com print anexo).
- Clicar **Liberar Data**: célula deixa de aparecer bloqueada e o dia fica disponível (registro `liberada=true` em `dp_datas_bloqueadas`).
- Em sábado/domingo, aparece bloco "Configuração do Dia" com limite editável e salvamento persistente.
- "Escala do dia" e "Atribuir folga manual" continuam funcionando.
- Em dias sem bloqueio nem fim de semana, o dialog mostra só escala + atribuição (como hoje).

## Arquivos

- `src/pages/dp/DpFolgas.tsx` — única alteração.
- Reuso: `src/pages/dp/DpAdminCalendario.tsx` (referência), `src/lib/dp/bloqueio-rules.ts` (sem mudanças).