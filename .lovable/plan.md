## Contexto

O widget da Pluggy foi aberto com o conector **Inter Empresas**, que não é Open Finance: é a API de Conta Digital PJ do Inter, autenticada por mTLS. Por isso ele pede Client Id, Client Secret e upload de `.key` (Private Key) e `.crt` (Certificate) — arquivos que só existem se você criar uma aplicação no Internet Banking Inter.

O conector correto para o fluxo com login + QR Code é o **Inter** (Open Finance), sem certificado.

## O que vou implementar

### 1. Tela de orientação antes de abrir o widget
Em `src/components/accounts/PluggyConnectDialog.tsx`, inserir um passo inicial (antes de carregar o script/pedir o token) com:
- Instrução curta: procure o banco pelo nome simples (ex.: "Inter", "C6 Bank", "Itaú").
- Alerta destacado: conectores com sufixo **"Empresas" / "Business" / "Corporate"** usam API própria do banco e vão pedir Client Id, Client Secret, chave privada e certificado — escolha-os só se você já tiver esses arquivos.
- Botão primário "Continuar para o banco" e secundário "Cancelar".
- Um checkbox "Não mostrar novamente" persistido em `localStorage`, para não atrapalhar quem já conhece o fluxo.

### 2. Passo a passo específico do Inter
No mesmo aviso, um bloco recolhível "Conectar Inter PJ" explicando: buscar **Inter**, autorizar com CNPJ/conta, ler o QR Code no app Inter Empresas, e voltar ao 360°FOOD para a importação automática (que já ficou resiliente após a correção anterior de conexões por QR Code).

### 3. Nenhuma mudança de backend
Sem migração, sem alteração em Edge Functions. Nada de filtro forçado na lista de conectores — os conectores mTLS continuam disponíveis para quem quiser usá-los, apenas com aviso claro.

## Detalhes técnicos

- Novo estado local `phase: 'intro' | 'launching' | 'running' | 'error'` no dialog; o efeito que carrega o script e pede o connect token passa a rodar somente quando `phase === 'launching'`.
- O fluxo de retomada (`hasPluggyResume()` / polling do `pluggy_connect_requests`) pula o `intro` e vai direto para a verificação, para não interromper conexões em andamento.
- Chave de preferência: `pluggy_connect_intro_dismissed_v1` em `localStorage`.
- Sem novas dependências; usa `Button`, `Checkbox` e tokens semânticos existentes.
