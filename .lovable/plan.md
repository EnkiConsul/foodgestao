## Objetivo

Trazer para o card **Pendências do Sistema** (`/dp` — Início) as mesmas fontes do projeto original Pakere: solicitações de exceção, trocas, **contracheques**, **adiantamentos**, **folhas de ponto** e **negociações sindicais** por unidade — todas com prazo, status (Atrasado / Hoje / Próximo) e opção de adiar.

## Mapeamento Pakere → 360°FOOD

| Pakere | 360°FOOD | Observação |
| --- | --- | --- |
| `unidades` (ativo, possui_relogio_ponto, tem_adiantamento, dia_adiantamento) | `dp_unidades` | Já tem todas as colunas necessárias |
| `documentos` (tipo, unidade_id, mes, ano) | `dp_documentos` (colaborador_id, referencia_data) + `dp_folha_periodos` (competencia, tipo, status) | Precisa derivar mês/ano; contracheque/adiantamento por `dp_folha_periodos`; ponto por `dp_documentos.tipo='ponto'` cruzando colaboradores da unidade |
| `negociacoes` (unidade_id, sindicato_laboral_id, ano, mes) | `dp_sindicato_negociacoes` | Colunas já existem 1:1 |
| `unidade_cargos.sindicato_laboral_id` | `dp_unidade_cargos.sindicato_laboral_id` | Junção idêntica |
| `pendencias_adiadas` | `dp_user_prefs.pendencias_adiadas` (JSON) | Já implementado — manter |

Sem migração de banco: todas as tabelas e colunas necessárias já existem.

## Regras que passam a ser aplicadas

Todas dentro de `src/hooks/useDpPendencias.tsx`, escopadas por `selectedCompanyId`. Cada bloco é `try/catch` para nunca derrubar o card em caso de erro parcial.

1. **Solicitações pendentes** — mantém a lógica atual de `dp_solicitacoes` (vencimento = created_at + 3d, aviso a 5d).
2. **Trocas aguardando gestor** — mantém a lógica atual de `dp_trocas`.
3. **Contracheque não fechado** — se `hoje.dia >= 10`, para cada unidade ativa, verificar se existe `dp_folha_periodos` com `tipo='contracheque_mensal'` e `status='fechado'` na competência do mês anterior. Se não, gera pendência com `data_vencimento = dia 10 do mês corrente` e cálculo de atraso.
4. **Adiantamento não fechado** — para cada unidade com `tem_adiantamento=true` e `dia_adiantamento` definido, se `hoje.dia >= dia_adiantamento + 5`, verificar `dp_folha_periodos` (`tipo='adiantamento'`, competência = mês corrente, `status='fechado'`). Gera pendência com vencimento = `dia_adiantamento + 5` do mês corrente.
5. **Folha de ponto não importada** — para cada unidade com `possui_relogio_ponto=true`, se `hoje.dia >= 10`, verificar existência de `dp_documentos.tipo='ponto'` com `referencia_data` no mês anterior, cruzando com colaboradores da unidade. Se `count = 0`, gera pendência.
6. **Negociação coletiva pendente** — para cada unidade ativa, listar `sindicato_laboral_id` distintos em `dp_unidade_cargos`. Para cada par (unidade, sindicato), buscar a última `dp_sindicato_negociacoes` (`sindicato_laboral_id`, `unidade_id`) ordenada por `(ano, mes)`. Duas rotas:
   - **Sem nenhuma** → pendência imediata "Nenhuma negociação cadastrada".
   - **Com última** → vencimento = último dia do mês (`ano+1`, `mes`); só vira pendência quando passou desse dia. Aviso amarelo a 60 dias antes.
7. **Folhas em aberto** (`dp_folha_periodos.status='aberto'`) — remover do card por virar redundante com os itens 3/4 (evita duplicar pendência da mesma competência).

## Ordenação e visual

- Ordenação final: `atrasoDias DESC`, depois `vencimento ASC` (mesma prioridade do Pakere).
- Manter o componente atual `PendenciasCard.tsx` — a estrutura visual (chips Atrasado/Hoje/Próximo, badges de status, botões Resolver/Detalhes/Adiar) já bate com o widget do Pakere. Nenhuma mudança visual necessária além dos ícones dos novos tipos:
  - contracheque → `FileText`
  - adiantamento → `Coins`
  - folha_ponto → `Clock`
  - negociacao → `Scale`
- Rotas de "Resolver":
  - contracheque → `/dp/folha`
  - adiantamento → `/dp/folha`
  - folha_ponto → `/dp/folha` (ajustável depois se houver rota dedicada)
  - negociacao → `/dp/documentos/act-cct`

## Fora de escopo

- Não vou criar tabela `pendencias_adiadas` — o adiamento já usa `dp_user_prefs.pendencias_adiadas` e funciona bem.
- Não vou alterar o portal (`DpMeuHome`) — o pedido é sobre a Home admin.
- Não vou consolidar/renomear rotas do menu.
