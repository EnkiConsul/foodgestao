# Histórico de Documentos: Leitura, Exclusão e Substituição

## 1. Cabeçalhos das colunas legíveis

Hoje a tabela usa larguras percentuais fixas e todos os títulos ficam em uma linha só, então "Competência" e "Colaborador" aparecem cortados ("COM...").

- Larguras recalibradas por conteúdo: Colaborador e Tipo ganham espaço; Competência, Aceite e Data ficam com largura mínima suficiente para o título inteiro.
- Título do cabeçalho deixa de ser truncado — os ícones de ordenar/filtrar passam a ficar colados ao texto, sem competir por espaço.
- Rótulos mais curtos onde não há perda de sentido: "Competência" → "Comp." apenas quando a coluna estiver estreita.
- Tabela com rolagem horizontal só quando realmente necessário (largura mínima), em vez de comprimir tudo.

## 2. Barra de filtros mais compacta

- "Restaurar Colunas" é removido (a ordem das colunas fica salva; se quiser voltar ao padrão, basta arrastar).
- A palavra "Filtros", o campo de busca e o botão "Limpar" passam a ocupar a mesma linha, no topo do card.
- Os seis seletores (Tipo, Unidade, Colaborador, Mês, Ano, Status) continuam na grade abaixo.

## 3. Excluir documento importado

Nova ação de lixeira na linha (e no card mobile) para **qualquer** documento listado no histórico, incluindo atestados/solicitações, negociações sindicais e registros disciplinares — cada um é excluído na sua origem correta, sem sair da tela de histórico.

- Confirmação com nome do colaborador, tipo e competência, além de aviso explícito: "a pendência deste documento voltará a aparecer na Conferência".
- Exclusão remove o registro, o arquivo no armazenamento e os aceites vinculados.
- A Conferência de Competências é recalculada a partir dos documentos existentes, então a pendência reaparece automaticamente; as listas de pendência e histórico são atualizadas na hora.

## 4. Substituir documento

Ação "Substituir" na mesma linha, também para todos os tipos de documento do histórico: o usuário escolhe um novo arquivo (PDF/imagem) e o registro é corrigido mantendo colaborador, tipo e competência.

- O arquivo antigo é apagado e o novo assume o lugar, com data de atualização renovada.
- Se o documento já tinha aceite do colaborador, o aceite é invalidado e o documento volta para "Aguardando" validação digital (o conteúdo mudou).
- Para documentos do acervo do DP, colaborador, tipo e competência podem ser ajustados na mesma janela, corrigindo importações classificadas errado sem excluir e reimportar. Nas outras origens (atestado, sindicato, disciplinar) a substituição troca apenas o arquivo, pois a classificação vem do próprio registro.

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx`: ajuste das larguras/`table-fixed`, remoção do botão de restaurar colunas, reorganização do cabeçalho do `DpFilterCard`, novas ações por linha e no card mobile.
- Novo componente `src/components/dp/documentos/DocSubstituirDialog.tsx` para upload do arquivo substituto e edição de colaborador/tipo/competência.
- Cada linha do histórico já carrega sua origem (bucket + tabela); exclusão/substituição roteiam para `dp_documentos`, `dp_solicitacoes`, `dp_sindicato_negociacoes` ou `dp_registros_disciplinares` com o bucket correspondente, mais limpeza em `dp_documento_aceites`. Se alguma dessas tabelas não permitir exclusão pelo administrador, a política é ajustada por migração no mesmo passo.
- Após ambas as ações, invalidação das queries do histórico e do painel de conferência (`DocConsistenciaPanel` deriva as pendências dos documentos existentes, sem tabela de pendência a reabrir).
- Ordem das colunas continua persistida como hoje; só o botão de reset sai.
