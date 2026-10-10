# Calendário unificado: Folgas + Férias + Rotina do Dia

Objetivo: a tela **Rotina → Calendário** passa a reunir tudo o que hoje se faz em Folgas, Férias e Operação do Dia, sem mexer nas telas antigas nem nas regras.

## O que entra na tela

**Folgas (vindo do Calendário de Folgas)**
- Marcar folga para uma pessoa no dia, com a mesma triagem atual: trocar a folga semanal, substituir folga já marcada ou folga extra.
- Ao tocar numa pessoa de folga: remarcar ou cancelar (com motivo), como hoje.
- Ver trocas aprovadas com o selo "Troca de folga" (dia cedido já some).
- Bloquear/liberar datas e ver o limite de folgas do dia (mesmos diálogos atuais).
- Contadores do dia (folgas, ocupação do limite) com clique para ver nomes.

**Férias (vindo da tela de Férias)**
- Férias aparecem no mês e no dia (já existe).
- Ação "Programar férias" no dia, abrindo o mesmo diálogo de gozo usado em Férias.
- Selo de alerta para quem tem risco de férias em dobro.

**Rotina do Dia (já existe, mantido)**
- Quem trabalha por setor, alterar setor do dia, mão de obra extra, convocações, testes, registrar ausência.

**Visão mensal e celular**: seguem como estão; filtros por tipo continuam.

## Como evitar conflito

- Reaproveitar os diálogos existentes (triagem de folga, remarcar/cancelar, bloqueio de data, gozo de férias) **sem copiar regras**: as validações continuam no servidor e nas mesmas funções. Nenhuma regra nova, nenhuma mudança no banco.
- Telas antigas (Folgas, Férias, Operação) ficam intactas; a mudança na Operação só ocorre dentro do modo "calendário" já separado.
- Mesmas permissões das telas de origem: quem não pode marcar folga ou programar férias não vê o botão. Colaboradores continuam sem acesso (só menu do DP).
- Praianos: botões de marcação de folga ficam ocultos onde a empresa não usa marcação, como hoje no calendário de folgas.
- Após cada ação, atualizar Calendário, Folgas, Férias e Operação juntos (mesmas chaves de atualização), para não haver telas mostrando dados diferentes.
- Uma folga marcada pelo Calendário é igual à marcada em Folgas (mesma gravação), então não há duplicidade.

## Fora do escopo
- Remover telas antigas, alterar regras de folga/férias/convocação, mudanças no Portal, publicação.

## Detalhes técnicos
- Extrair de `DpFolgas.tsx` as ações por pessoa/dia (triagem `AtribuirFolgaTriagemDialog`, remarcar/cancelar, `DataDialog`, `LiberarEscopoDialog`) para um componente compartilhado `FolgaAcoesDia`, usado por Folgas e Calendário; Folgas passa a usá-lo sem mudança visual.
- Em `DpOperacaoPanorama` (modo calendario): botões "Marcar folga", "Programar férias", "Bloquear data" no dia; menu da pessoa ausente com Remarcar/Cancelar.
- Férias: reutilizar `FeriasGozoDialog` com colaborador pré-selecionado; risco de dobra via lógica existente (`ferias-risco-dobra`).
- Permissões via `tem_permissao`/hooks já usados em Folgas e Férias; respeitar config de marcação da empresa.
- Invalidação de queries: chaves de folgas, férias, trabalho excepcional e panorama.
- Testes: unidade para o mapeamento ação → disponibilidade (permissão, empresa sem marcação); verificação no navegador na Pakerê, semana de 05/10/2026, desktop e celular.
