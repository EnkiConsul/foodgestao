# Corrigir rotação no aplicativo Android instalado

## Objetivo
Permitir que o aplicativo já instalado acompanhe a rotação automática do Android e, ao ficar deitado, use o visual tablet com o menu lateral recolhido.

## Plano
1. Na abertura do aplicativo instalado, solicitar ao Android a liberação de qualquer orientação que tenha ficado presa pela instalação anterior.
2. Fazer essa liberação de forma compatível e silenciosa: aparelhos sem suporte continuam funcionando normalmente.
3. Manter o manifesto com orientação livre e validar que a versão publicada continua entregando essa configuração.
4. Testar a troca retrato → paisagem → retrato em dimensões de celular Android, confirmando também a mudança para o visual tablet e o menu recolhido.
5. Como o Android pode conservar configurações antigas do momento da instalação, orientar uma única reinstalação caso a instalação atual ainda permaneça travada após receber a atualização.

## Detalhes técnicos
- Aplicar `screen.orientation.unlock()` somente quando disponível e em execução como aplicativo instalado.
- Não adicionar modo offline nem novo cache do aplicativo.
- Preservar o comportamento atual no navegador, iPhone, tablet e computador.
