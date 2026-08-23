# Ajustes: lista de colaboradores, sócio e regras de folgas

## 1. Alinhamento das colunas em Colaboradores

Na tabela desktop de `/dp/colaboradores`: coluna **Colaborador** permanece à esquerda; **Cargo, Unidade, Status, Perfil e Ações** ficam centralizados (cabeçalho e célula). A coluna **Unidade** passa a quebrar linha (`whitespace-normal break-words`) em vez de truncar, igual ao padrão já usado no Histórico de Documentos. Reordenação, redimensionamento, ordenação e filtros continuam funcionando. Cards mobile não mudam.

## 2. Desligamento e isonomia do sócio

- Na ficha resumo do colaborador desligado, os campos **Motivo** e **Elegibilidade para Recontratação** deixam de ser exibidos; permanecem data da demissão, acesso ao portal até e observações.
- Na aba **Remuneração**, quando o vínculo é **Sócio**, os avisos de divergência do princípio da isonomia deixam de ser calculados/exibidos (sócio não é comparável ao quadro CLT). O mesmo vale para o aviso de benefícios retirados que exige ciência de isonomia no salvamento.

## 3. Alerta do sócio recolhido

O texto longo sobre pró-labore / somente lucros sai do bloco fixo e passa a ficar atrás de um ícone de informação ao lado do título "Remuneração do sócio": ao passar o mouse (ou tocar, no mobile) o texto completo aparece. Fica visível apenas uma linha curta de resumo.

## 4. Erro ao salvar o sócio Gabriel

Causa provável identificada na leitura do formulário: no salvamento o campo de unidade é enviado como string vazia quando o sócio está em "Geral", e o banco espera um identificador válido ou vazio nulo. Correção: enviar unidade nula nesse caso (mesmo tratamento já usado em outros pontos do formulário). Além disso, a mensagem de erro passará a sempre exibir a descrição do erro retornado pelo backend (hoje ela pode aparecer vazia), incluindo o código, para que nenhum erro fique silencioso. Após o ajuste, o cadastro do sócio em "Geral" será testado no preview.

## 5. Regras de folgas: salvar no topo e pendência

- O botão **Salvar** da tela de regras de folgas passa para o canto superior direito do cabeçalho da tela (mantendo também o comportamento atual do diálogo de replicação para outras unidades); o botão do rodapé é removido.
- Nova pendência no quadro de **Pendências do Sistema** do início do módulo: "Cadastrar regras de folgas" — gerada por unidade que ainda não tem regra própria nem regra padrão da empresa definida, com atalho para a tela de regras.
- Na aba de horário de trabalho do colaborador, atalho "Regras de folgas": ao clicar, se houver alterações não salvas, o sistema pergunta se deseja salvar antes de navegar (Salvar e ir / Ir sem salvar / Cancelar).

## Detalhes técnicos

- `src/pages/dp/DpColaboradores.tsx`: `cellClass`/`headerClass` centralizados no objeto `COLS`; render de Unidade sem `truncate`.
- `src/components/dp/ColaboradorFichaDialog.tsx`: remover os dois `Field` do bloco Desligamento.
- `src/components/dp/ColaboradorFormDialog.tsx`: não passar `isonomia` quando `socioSelecionado`; pular o gate de ciência de isonomia para sócio; `unidade_id: form.unidade_id || null` no upsert; `mensagemErro` incluir `code` e fallback explícito.
- `src/components/dp/RemuneracaoFields.tsx`: bloco do sócio com `Tooltip`/`Popover` no ícone de info.
- `src/pages/dp/cadastros/DpConfiguracoesJornada.tsx`: mover ação de salvar para o header da página.
- `src/hooks/useDpPendencias.tsx`: nova pendência tipo "Regras" a partir de `dp_config_dp` (ausência de linha padrão da empresa / da unidade) usando as unidades ativas.
- `src/components/dp/ColaboradorJornadaPanel.tsx`: atalho com diálogo de confirmação antes de navegar para `/dp/cadastros/jornada` (regras de folgas).
