# Regras técnicas do projeto

- Limites de plano são calculados no banco pela função `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` em `src/lib/billing/limites.ts` — fonte única evita divergência entre telas.
- O valor mensal cobrado é sempre plano base + adicionais ativos não isentos (`subscription_total_cents` no banco, `asaas-create-checkout` na cobrança) — assinaturas isentas não geram cobrança.
- Adicional contratado no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma única vez na próxima fatura; `prorata_billed_at` marca o que já foi cobrado, evitando cobrança repetida.
- Limites de colaboradores e unidades também são barrados no banco por constraint triggers (`dp_guard_limite_*`) usando `assinatura_limite_excedido` — o app não é a única defesa.
- Recontratação preserva identidade, documentos atuais e histórico; cargo, salário, benefícios e jornada são novos — evita condições defasadas.
- Rotina de banco só recebe `GRANT EXECUTE ... TO authenticated` quando o frontend a chama via `supabase.rpc`, quando uma RLS policy a referencia ou quando um gatilho `SECURITY INVOKER` a usa; as demais ficam só com `service_role` — menor privilégio sem quebrar tela.
- `dp_ficha_aplicar` é `SECURITY DEFINER` com autorização explícita por `tem_permissao(company_id, 'dp.colaboradores', 'inclusao')`; a tabela `dp_colaboradores` permanece sem gravação direta para `authenticated` — mantém a aplicação atômica da ficha sem reabrir acesso amplo.
- O portal não lê `dp_colaboradores` de colegas: `dp_portal_equipe_unidade()` expõe só nome, função e folga fixa da unidade — preserva privacidade.
- Na pré-admissão, o checklist compartilhado governa leitura e envio; desativar requisitos preserva anexos históricos — evita divergência na validação.
- Recibo de cadastrado ativo: Portal/físico; avulso ou desligado: também WhatsApp — quem não acessa o portal ainda assina.
- Imagem da assinatura (PNG em data URL) é gravada só pelo servidor em `assinatura_imagem` (dp_recibos/dp_documento_aceites), imutável após gravada, e estampada no PDF com rubrica em todas as páginas — reimpressão fiel sem confiar no cliente.

- Notificações push (Web Push): fila `dp_push_fila` alimentada por gatilho em `dp_notificacoes`, envio pela função `dp-push-dispatch` a cada minuto e receptor isolado em `/push/sw.js` (sem cache) — mantém o push separado do worker de limpeza `/sw.js`.
- Disciplinar: o portal só lê vias físicas assinadas (`via_assinada_path`, advertência escrita/suspensão) via `dp_portal_meus_disciplinares()`; verbais, observações e minutas ficam no dossiê interno da ficha — evita expor anotações do gestor e passivo de dano moral.
