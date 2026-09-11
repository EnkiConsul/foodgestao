# Corrigir fechamento do alerta intermitente e ordem das férias

## Objetivo
Garantir que uma confirmação de intermitente desapareça imediatamente após a resposta e que as férias sejam sempre exibidas da mais atrasada para a mais recente.

## Alterações
- Após marcar **Trabalhou** ou **Não trabalhou**, atualizar imediatamente as pendências visíveis e remover o item respondido da janela aberta, sem exigir fechar e abrir novamente.
- Se o item era o último daquele grupo, fechar automaticamente a janela de detalhes e atualizar o contador do cartão.
- Manter a resposta persistida como fonte definitiva; ao marcar **Não trabalhou**, não gerar cobrança documental naquela competência.
- No detalhe das pendências da tela inicial, ordenar os grupos de colaboradores pela maior quantidade de dias em atraso, usando o nome apenas como desempate.
- Preservar a mesma regra na página completa de pendências, para que férias vencidas mais antigas apareçam primeiro em ambas as telas.

## Validação
- Reproduzir com o Wanderson em 08/2026 e confirmar que o aviso some imediatamente após **Não trabalhou**.
- Confirmar que o registro permanece fechado ao recarregar ou retornar à tela.
- Conferir férias com diferentes limites concessivos, garantindo ordem decrescente de atraso nas duas telas.
- Executar os testes direcionados de pendências e validar a navegação no celular.
