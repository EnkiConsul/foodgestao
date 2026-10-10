# Plano: Calendário da Rotina — mês clicável com detalhe completo do dia

Objetivo: na tela Calendário (menu Rotina), a "Rotina do Mês" funciona como o calendário de folgas. Clicar num dia abre o detalhe desse dia na própria tela (sem trocar para "Rotina do Dia"), com tudo que existe em Folgas + Rotina do Dia + novidades. As telas antigas seguem intactas e colaboradores continuam sem acesso.

## Etapa 1 — Corrigir os dados mostrados

1. Trocas de folga (Hanna, Thais, Cristiane)
   - Quem cedeu a folga fixa numa troca deixa de aparecer de folga naquele dia e passa a contar como "trabalhando".
   - A folga recebida pela troca aparece no dia certo, com selo "Troca de folga".
   - Resultado esperado na semana 05–11/10: dia 05 só Hanna, dia 07 só Thais, dia 08 só Cristiane.
2. Atraso não é ausência
   - Atrasos e saídas antecipadas saem de "Demais ausências" no mês.
   - Continuam visíveis no detalhe do dia, como ocorrência de quem trabalhou.

## Etapa 2 — Mês clicável no estilo do calendário de folgas

- Desktop: grade mensal com nomes por tipo (Folgas, Férias, Faltas, Atestados/Licenças, Demais ausências), etiqueta "Feriado" (sem nome), contagem de quem trabalha e destaque de dia com cobertura abaixo do mínimo.
- Mobile: mesma lista em linhas usada hoje no calendário de folgas (1 dia = 1 linha).
- Filtros do topo valem só para o mês; o detalhe do dia mostra tudo sempre.
- Uma unidade por vez (já existente).

## Etapa 3 — Detalhe do dia na própria tela

Ao clicar no dia, abre um painel (lateral no desktop, tela cheia no celular) com o mês mantido ao fundo e botões "dia anterior / próximo".

Conteúdo do painel:
- Cabeçalho: data, nome do feriado (se houver), limite de folgas do dia, bloqueios ativos.
- Rotina da loja: quem trabalha por setor/turno, cobertura mínima e faltas de gente, atrasos registrados.
- Ausências do dia: folgas (fixa, extra, troca), férias, faltas, atestados/licenças.
- Convocações: convocados, aceitas, pendentes de aceite, recusadas.
- Testes e folguistas/coberturas do dia.

Ações (todas reaproveitando as janelas e regras que já existem, sem regra nova):
- Folgas: marcar folga (triagem com limites e bloqueios), remarcar, cancelar, aprovar/recusar pedidos pendentes, registrar troca, bloquear/liberar a data e ajustar o limite do dia.
- Rotina: registrar ausência, mão de obra extra, alterar setor do colaborador no dia.
- Convocações: convocar, ver/reenviar pendentes.
- Incluir teste e incluir folguista/cobertura.
- Férias: ver quem está de férias e abrir o agendamento existente.

Cada ação, ao concluir, atualiza o painel e o mês sem recarregar a tela.

## Etapa 4 — Conferência

- Testes automáticos: atraso não conta como ausência; quem cedeu folga na troca não aparece de folga; folga de troca aparece no dia recebido; filtros não afetam o detalhe.
- Conferência no navegador (desktop e celular) com os dados da Pakerê na semana 05–11/10 e no feriado de 12/10.
- Nada é publicado.

## Fora do escopo

- Não mudar regras de folga, férias, convocação ou permissões.
- Não remover o calendário de folgas, férias ou a Operação antigos.
- Não liberar a tela para colaboradores.

## Detalhes técnicos

- Panorama (`useDpOperacaoPanorama` / `operacao-panorama.ts`): ler `dp_dia_trabalho_excepcional` e `dp_folgas.origem='troca'`; suprimir folga fixa cedida.
- `calendario-rotina.ts`: remover `atrasado` e `saida_antecipada` do mapa de ausências; ajustar teste.
- `DpOperacaoPanorama.tsx` (modo calendário): `onAbrirDia` passa a abrir painel (`Sheet`) com `DetalheDiaOperacao` em vez de `trocarAba("dia")`.
- Bloco de folgas do painel: extrair de `DpFolgas.tsx` o conteúdo do diálogo do dia (triagem `AtribuirFolgaTriagemDialog`, remarcar/cancelar, `DataDialog` de bloqueio, limite) para um componente compartilhado usado pelas duas telas, mantendo `useDpFolgasQueries` e as mesmas mutações/RPCs.
- Sem mudanças no banco.
