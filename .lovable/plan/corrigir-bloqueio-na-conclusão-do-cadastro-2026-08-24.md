# Corrigir bloqueio na conclusão do cadastro

## Diagnóstico confirmado

- A tentativa chega ao backend, mas é recusada com `empresa_ja_cadastrada`.
- O CNPJ **14.845.850/0001-03** já está cadastrado para **PRAIANOS BAR E RESTAURANTE LTDA**.
- O cadastro não pode criar uma segunda empresa com o mesmo CNPJ.

## Ajustes

1. **Validar o CNPJ antes da seleção de módulos**
   - Ao identificar um CNPJ já cadastrado, interromper o avanço antes da etapa final.
   - Evitar que o usuário preencha e selecione módulos para só descobrir o bloqueio ao concluir.

2. **Direcionar conforme o acesso do usuário**
   - Se a conta logada já tiver vínculo autorizado com a empresa, concluir o estado do onboarding e abrir o painel dessa empresa.
   - Se não tiver vínculo, informar claramente que o CNPJ já está cadastrado e orientar a entrar com a conta responsável ou solicitar convite.
   - Não permitir que apenas conhecer um CNPJ conceda acesso à empresa.

3. **Melhorar o retorno visual**
   - Exibir a mensagem de bloqueio junto ao campo CNPJ, além do aviso temporário.
   - Manter o botão final disponível apenas quando os dados puderem prosseguir.
   - Preservar os dados preenchidos para o usuário poder voltar e corrigir o CNPJ.

## Validação

- Testar CNPJ novo: cadastro e teste gratuito devem ser criados normalmente.
- Testar CNPJ existente com vínculo: usuário deve ser direcionado ao painel correto.
- Testar CNPJ existente sem vínculo: acesso deve continuar bloqueado, com orientação clara.
