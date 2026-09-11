# Evitar recarregamento das pendências ao voltar ao início

## Objetivo
Ao sair e voltar para a tela inicial, mostrar imediatamente as pendências já carregadas, sem uma nova espera quando nenhuma ação relevante ocorreu.

## Alterações
- Tornar a identificação do cache das pendências estável por empresa, sem incluir o objeto de configurações na chave da consulta.
- Manter o resultado das pendências em memória durante toda a sessão, em vez de descartá-lo após 15 minutos.
- Impedir nova consulta apenas por remontar a tela, reconectar a internet ou voltar para a aba do navegador.
- Continuar mostrando os dados atuais enquanto uma atualização permitida estiver em andamento, sem substituir o painel por “Carregando”.
- Preservar exatamente os gatilhos já definidos: rotina diária às 03:00, conclusão ou alteração relevante de pendência e botão manual Atualizar.
- Manter a primeira carga necessária ao entrar na empresa pela primeira vez na sessão.

## Validação
- Abrir o início, navegar para outra tela e voltar após mais de 15 minutos: o painel deve aparecer imediatamente e sem nova consulta automática.
- Confirmar que o botão Atualizar continua recalculando e atualizando a data/hora.
- Confirmar que concluir uma pendência ainda invalida e atualiza o painel.
- Executar os testes direcionados de pendências e a verificação de tipos.

## Detalhes técnicos
A consulta atual já usa dados sem prazo de expiração, mas herda descarte após 15 minutos e sua chave inclui todo o objeto de configuração. A correção usará uma chave estável por empresa, retenção durante a sessão e invalidação explícita quando as configurações ou ações relevantes mudarem.
