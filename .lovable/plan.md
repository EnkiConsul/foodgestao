# Plano — Ajustes E Evolução De Jornadas, Folgas, Férias E Importação

## 1. Notificação De Faltantes Só Da Unidade Do Documento

**Hoje:** em `BulkReviewInline.tsx` a unidade do lote é deduzida dos colaboradores já casados e só é usada quando **todos** pertencem à mesma unidade; havendo mais de uma (ou nenhuma), vira `null` e `computeCoverage` passa a cobrar documento de **toda a empresa** — daí a cobrança de alguém de outra unidade num lote do Garavelo.

**Como passa a funcionar:** a detecção automática da unidade continua. A lista de faltantes passa a considerar apenas as unidades efetivamente identificadas no lote:
- uma unidade identificada → espera só colaboradores dela;
- várias unidades no mesmo arquivo → espera só colaboradores dessas unidades;
- colaboradores sem `unidade_id` aparecem em aviso separado ("sem unidade cadastrada"), nunca na lista de faltantes;
- continua excluindo desligados/não admitidos na competência.

Vale para folha de ponto, contracheque, adiantamento e demais tipos. Alterações: `src/lib/dp/bulk-coverage.ts` (aceitar conjunto de unidades), `BulkReviewInline.tsx`/`BulkReviewDialog.tsx`, painel de faltantes (mostrar a unidade considerada), e `unidade_id` em `dp_bulk_import_batches` para gravar a unidade confirmada do lote.

### 1.1 Unidade Não Identificada No Documento

Quando o processamento não conseguir identificar a unidade de um documento/lote:
- nenhuma cobrança de faltantes é feita (evita alarme falso sobre a empresa inteira);
- o lote fica marcado como **"Unidade não identificada"**, com alerta visível na revisão e uma pendência para o gestor no painel de pendências do DP;
- o alerta oferece duas saídas diretas: **vincular manualmente** a unidade (seletor com as unidades existentes, aplicável ao documento individual ou ao lote inteiro) ou **cadastrar nova unidade**, abrindo o cadastro e retornando ao lote já com a nova unidade selecionada;
- a aprovação do lote fica bloqueada até a unidade ser definida, com opção explícita de "aprovar sem unidade" registrada em auditoria;
- após o vínculo, a cobertura é recalculada considerando só a unidade escolhida.

## 2. Adiantamento Salarial

O campo já existe: `dp_colaboradores.optante_adiantamento` (toggle "Opta por Adiantamento Salarial" do anexo 1) — nenhuma migration necessária. Em `computeCoverage`, quando `tipo = 'adiantamento'`, só entram colaboradores com `optante_adiantamento = true` **e** da unidade identificada, seguindo o mesmo padrão já usado com `possui_folha_ponto` no tipo ponto.

## 3. Sem Rolagem Lateral

O cadastro de colaboradores (desktop) usa `overflow-x-auto` com muitas colunas e os botões de ação ficam fora da área visível. Correção: remover a rolagem horizontal, manter apenas as colunas essenciais (Nome, Unidade, Cargo, Perfil, Status, Ações), mover as demais para tooltip/linha secundária e agrupar ações menos usadas num menu "⋯", garantindo que tudo caiba na largura da tela. Mesmo tratamento nas demais tabelas do DP que hoje rolam lateralmente.

## 4. Folga Dominical — 3 Semanas Como Padrão

**Causa confirmada no banco:** todas as empresas estão com `setor_comercio = false` e `periodicidade_domingo = 7`, por isso a tela mostra 7 semanas (anexo 2).

**Correção:** migration marcando `setor_comercio = true` e `periodicidade_domingo = 3` para as empresas que ainda estão no valor default intocado, e novo campo `modo_domingo` com opções **Conforme Legislação / A Cada 3 Semanas / A Cada 7 Semanas / Personalizado**. A opção de 7 semanas passa a exigir vínculo com acordo/convenção (`dp_sindicato_negociacoes`) ou confirmação de ciência; personalizado mantém o diálogo de ciência legal já existente. O toggle "Empresa do comércio" deixa de ser o controle principal e vira consequência do modo escolhido.

## 5. Pendência De Escala + Geração Automática No Fechamento

- **Pendência do gestor:** no último dia do mês, se houver colaborador sem folga definida para o mês seguinte, criar pendência "Definir Folgas Do Mês" no painel administrativo, com contagem de pendentes e link direto para o gerador.
- **Processamento automático:** job agendado (`pg_cron`) às 23:59 do último dia do mês gera as folgas faltantes automaticamente, respeitando jornada vigente, rodízio de domingos, datas bloqueadas, cobertura mínima e limite diário. Registra origem `automatico` e notifica o gestor com o resumo.
- **Nunca sobrepõe folgas já marcadas:** o gerador só cria folgas para colaborador/semana sem nenhuma folga ativa; qualquer folga existente (escolha do colaborador, sorteio, troca, férias, lançamento do admin) é preservada e apenas usada como restrição de limite diário. Nada é atualizado nem excluído — o job é exclusivamente de inserção, com verificação de duplicidade por colaborador + data.
- **Geração automática nasce ligada** (estamos testando somente na Pakerê), com opção por empresa para desligar e ajustar dia/horário de corte.

## 6. Reorganização E Padrão Visual

- Rota `/dp/cadastros/regras-jornada` passa a **Folgas → Configurações → Regras De Folgas** (`/dp/folgas/configuracoes/regras`), com redirect da rota antiga; sidebar e hub ajustados.
- Aplicar Title Case (`src/lib/titleCase.ts`) em títulos, menus, abas, seções e botões do módulo DP.

## 7. Motor De Regras De Férias

Dentro de Regras De Folgas: `dp_ferias_regras` (máximo de colaboradores simultâneos por empresa/unidade, por cargo e por turno) e `dp_ferias_bloqueios` (períodos proibidos — Natal, Ano Novo, Dia das Mães, alta temporada, eventos; datados ou recorrentes anuais), validados por trigger na criação do gozo de férias e refletidos como alerta na tela de Férias, com aviso antecipado de períodos a vencer.

## 8. Acordo Coletivo E Descanso Dominical

Campo `tipo_descanso_domingo` (`legal` | `acordo_coletivo`) em `dp_config_dp`, vinculado a uma negociação sindical (sindicato, documento, validade). No modo acordo, o domingo pode ser substituído por sábado no rodízio — cenário do Pakerê — e o relatório de conformidade passa a avaliar "folga de fim de semana" em vez de domingo estrito.

## 9. Separação De Pendências Admin vs Colaborador

`PendenciasCard` (que consome o hook administrativo `useDpPendencias`, de escopo da empresa inteira) hoje é renderizado também em `portal/DpMeuHome.tsx`. Vou separar em `useDpPendenciasAdmin` (atual, incluindo a nova pendência de unidade não identificada) e `useDpPendenciasColaborador` (escolher folga do mês, documentos a enviar/assinar, trocas aguardando resposta, férias, cadastro desatualizado), com o portal usando o segundo. Sem tabela nova — as pendências são derivadas dos dados existentes.

## Riscos

- Filtro rígido por unidade pode esconder colaboradores sem unidade cadastrada: tratado com aviso explícito em vez de silêncio.
- A migration de 3 semanas só altera empresas que nunca personalizaram o valor.
- Geração automática ligada por padrão: mitigada pela regra de nunca sobrepor folgas existentes e pelo log/notificação de tudo que for criado.

## Ordem De Entrega

1. Cobertura por unidade + fluxo de unidade não identificada + adiantamento (1, 1.1 e 2).
2. Tabela sem rolagem lateral (3).
3. Folga dominical 3 semanas + modo (4).
4. Rota/nome Regras De Folgas + Title Case (6).
5. Pendência e geração automática de escala (5).
6. Motor de férias (7) e acordo coletivo (8).
7. Separação de pendências (9).
