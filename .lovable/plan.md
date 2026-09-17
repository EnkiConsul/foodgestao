# Convite de pré-admissão: unidade primeiro, CPF obrigatório e aba na tela de Colaboradores

## O que muda para quem usa

1. **Enviar link de pré-cadastro**
   - A **Unidade prevista** passa a ser o primeiro campo. O **Cargo previsto** só fica disponível depois de escolher a unidade e lista apenas os cargos vinculados àquela unidade.
   - Trocar a unidade limpa o cargo já escolhido, para nunca sobrar uma combinação inválida.
   - Se a unidade ainda não tiver cargos vinculados, aparece o aviso "Esta unidade ainda não tem cargos vinculados" e a lista mostra todos os cargos da empresa, para não travar o convite.

2. **CPF obrigatório no convite**
   - Novo campo **CPF do candidato**, obrigatório, com máscara e conferência dos dígitos.
   - Antes de criar o convite o sistema confere:
     - já existe colaborador ativo com esse CPF na empresa → recusa e mostra o nome;
     - já existe pré-admissão em andamento com esse CPF → recusa e orienta a abrir a ficha existente.
   - O CPF fica preenchido e **travado** no formulário do candidato (ele confere, não digita de novo). Se preferir que o candidato possa corrigir, me avise e eu ajusto.

3. **Tela de Colaboradores**
   - Nova aba **Pré-Admissão**, logo depois de **Em Teste**, mostrando as fichas de pré-admissão da empresa com as mesmas ações de hoje (revisar, gerar novo link, cancelar) e um botão para convidar candidato.
   - A tela atual de pré-admissões continua funcionando pelo endereço de sempre.

## Detalhes técnicos

- `PreadmissaoConviteDialog.tsx`: reordenar os campos (unidade → cargo), carregar os vínculos de `dp_unidade_cargos` para a unidade escolhida (novo hook `useDpCargosDaUnidade`), desabilitar o cargo até haver unidade, incluir campo CPF com validação local (dígitos verificadores, via helper já existente de CPF) e passar `cpf` no payload.
- `dp-preadmissao-convite` (ação `criar`): exigir CPF, normalizar para dígitos, validar dígitos verificadores no servidor, checar duplicidade em `dp_colaboradores` (mesma empresa, ativo) e em `dp_preadmissoes` com status aberto, validar que o cargo pertence à unidade em `dp_unidade_cargos` (quando houver vínculos) e gravar `dp_preadmissoes.cpf`. Erros claros com HTTP 409 para duplicidade.
- `dp-preadmissao-publica` / `PreAdmissao.tsx`: quando a ficha já vem com CPF, exibir o campo somente leitura e o servidor rejeitar CPF diferente do gravado (mantendo a versão/idempotência atual).
- `DpColaboradores.tsx`: acrescentar `preadmissao` em `ORIGENS` após `teste`; ao selecionar, renderizar a lista de pré-admissões extraída de `DpPreadmissoes.tsx` para um componente reutilizável, preservando permissões e o contexto de empresa.
- Sem migração: a coluna `cpf` já existe em `dp_preadmissoes`. Nenhuma alteração de permissões.
- Validação: typecheck, lint dos arquivos alterados e teste real no navegador (convite com CPF duplicado recusado, cargos filtrados pela unidade, aba nova carregando).
