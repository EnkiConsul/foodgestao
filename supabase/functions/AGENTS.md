# Regras das funções do servidor
- Recibos avulsos ficam em `dp_recibos` (só leitura para `authenticated`); emissão, link do WhatsApp (token só em hash) e assinatura passam pelas funções `dp-recibo-emitir` e `dp-recibo-publico` — escrita só no servidor, com confirmação de CPF.

- Recibo por link (WhatsApp com confirmação de CPF) vale para qualquer beneficiário, inclusive colaborador ativo; portal continua exclusivo de cadastrados — quem não usa o app ainda assina.
