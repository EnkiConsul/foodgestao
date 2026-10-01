# Regras das funções do servidor
- Recibos avulsos ficam em `dp_recibos` (só leitura para `authenticated`); emissão, link do WhatsApp (token só em hash) e assinatura passam pelas funções `dp-recibo-emitir` e `dp-recibo-publico` — escrita só no servidor, com confirmação de CPF.
