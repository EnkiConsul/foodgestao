# Regras das funções do servidor
- Recibos avulsos ficam em `dp_recibos` (só leitura para `authenticated`); emissão, link do WhatsApp (token só em hash) e assinatura passam pelas funções `dp-recibo-emitir` e `dp-recibo-publico` — escrita só no servidor, com confirmação de CPF.

- Recibo por link (WhatsApp com confirmação de CPF) vale para qualquer beneficiário, inclusive colaborador ativo; portal continua exclusivo de cadastrados — quem não usa o app ainda assina.

- Notificações push (Web Push): fila `dp_push_fila` alimentada por gatilho em `dp_notificacoes`, envio por `dp-push-dispatch` a cada minuto e receptor isolado em `/push/sw.js` (sem cache) — separado do worker de limpeza `/sw.js`.
- Asaas Produção×Sandbox: `asaas_env` em contas, assinaturas, faturas e eventos; webhook define o ambiente só pelo token, worker nunca cruza ambientes (divergência em `asaas_env_divergencias`) e `asaasFetch` escolhe credencial pelo registro; régua, fiscal, métricas, conciliação e acesso leem só produção — teste nunca afeta cliente real.
