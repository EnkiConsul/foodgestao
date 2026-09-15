# Link de criação de senha sempre no endereço oficial

## O que está acontecendo

O link de ativação/nova senha é montado com o endereço da tela onde o gestor estava no momento do clique. Se o gestor liberou o acesso pelo ambiente de pré-visualização do Lovable, o link sai com esse endereço (`...lovable.app`).

O link funciona — a página de criar senha é a mesma e o código é válido. Mas não é o ideal para mandar ao colaborador: é um endereço de teste, longo, pouco confiável para quem recebe e pode mudar.

## O que vai mudar

O link entregue ao colaborador passa a usar sempre o endereço oficial `https://aveto360.com`, independente de onde o gestor estava quando liberou o acesso.

Única exceção: quando o gestor está rodando o sistema na própria máquina (desenvolvimento), o link continua apontando para a máquina local, para permitir testes.

Nada muda no restante: validade de 24h para ativação e 30min para nova senha, uso único, o gestor continua sem ver a senha.

## Detalhes técnicos

- `supabase/functions/_shared/portal-access.ts`, função `linkDeAcesso`: trocar a lista permissiva `ORIGENS_OK` por uma regra que aceita somente `localhost`/`127.0.0.1` como origem dinâmica; qualquer outra origem (incluindo `lovable.app`, `lovableproject.com`, `lovable.dev` e subdomínios de preview) cai no fallback canônico `https://aveto360.com`.
- Manter o fallback atual como constante única no arquivo.
- Consumidores (`dp-criar-acesso-colaborador`, `dp-reset-password`, demais chamadas de `linkDeAcesso`) não mudam.
- Sem migration, sem mudança de banco, sem mudança de UI.

## Observação

Links já enviados com endereço de preview continuam válidos até expirar. Para a Sílvia, o mais simples é gerar um novo link depois do ajuste.
