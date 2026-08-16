# Cadastro do colaborador: salvar sem fechar a tela

Hoje o rodapé tem um único botão (Criar/Atualizar) que salva as três abas de uma vez e, ao terminar, fecha o diálogo. Isso obriga a reabrir o cadastro para mexer em outra aba.

## Opção recomendada

Sua sugestão está certa na essência, mas em vez de só um "Próximo" o melhor é separar salvar de navegar. Assim o usuário edita em qualquer ordem, sem perder trabalho e sem fechar a tela:

- **Salvar e continuar** (ação principal): grava tudo o que está preenchido nas três abas e **mantém o diálogo aberto**, com toast de confirmação. Nada de fechar.
- **Próximo** (ação secundária, ao lado): salva e avança para a aba seguinte — Dados → Horário de Trabalho → Remuneração. Na última aba esse botão não aparece.
- **Voltar**: aparece a partir da 2ª aba, apenas navega (sem salvar), já que os dados ficam no formulário.
- **Concluir**: fecha o diálogo. Se houver alteração não salva, pergunta antes ("Salvar antes de sair?" / "Sair sem salvar").
- Indicador de progresso no topo, "Etapa 2 de 3", e ponto laranja na aba que tiver pendência obrigatória.

## Comportamentos importantes

- **Novo colaborador**: o primeiro salvamento cria o registro e o diálogo continua aberto na aba seguinte (comportamento parecido com o atual, mas sem fechar depois nas próximas gravações).
- **Alterações não salvas**: se o usuário trocar de aba pelas próprias abas do topo (sem usar Próximo), nada é perdido — o estado do formulário já é compartilhado; ele só precisa salvar antes de sair.
- **Bloqueios existentes preservados**: se o Horário de Trabalho exigir ciência legal ou der erro, o sistema continua levando para aquela aba e não fecha nem avança.
- **Pendência de remuneração** continua sendo aviso (não bloqueia), com atalho para a aba.

## Detalhes técnicos

- `src/components/dp/ColaboradorFormDialog.tsx`:
  - `submit` ganha um parâmetro de intenção (`"stay" | "next" | "close"`); remove-se o `onOpenChange(false)` incondicional do caminho de edição.
  - Rodapé passa a montar os botões conforme a aba atual (`tab`) e o estado (`isEdit || criadoId`).
  - Flag `dirty` derivada da comparação do estado do formulário com o carregado, usada no aviso ao fechar (AlertDialog no padrão já usado no arquivo, sem `window.confirm`).
  - Após salvar sem fechar, recarregar os dados do colaborador (invalidação já feita pelos hooks) para refletir valores normalizados.
- Sem mudanças de banco, RLS ou regras de cálculo.
