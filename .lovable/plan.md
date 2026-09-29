# Corrigir conclusão da ficha importada

## Resultado
- Permitir que usuários com autorização de cadastro no Pessoas concluam a ficha pela rotina oficial, mantendo a gravação direta bloqueada.
- Retirar Pix/dados bancários da lista de pendências desta tela, pois esses dados não são preenchidos nela.
- Fazer os campos obrigatórios vazios parecerem realmente não selecionados e informar exatamente quais escolhas ainda faltam.
- Traduzir falhas de permissão ou validação em mensagens úteis, sem expor textos técnicos.

## Implementação
- Ajustar a função transacional da ficha para executar com privilégio controlado, validar explicitamente a sessão, a permissão `dp.colaboradores` e o vínculo com a empresa antes de gravar.
- Preservar validações multiempresa, allowlist, bloqueios, atomicidade e idempotência existentes.
- Filtrar a pendência de dados bancários apenas na conferência da importação.
- Trocar opções sentinela como “Confirmar opção” por placeholder visual e montar a mensagem com os campos realmente ausentes.
- Adicionar testes focados em validação da tela e acesso da rotina.

## Verificação
- Executar os testes relacionados à ficha e validações.
- Confirmar compilação e ausência de novos erros na prévia.
