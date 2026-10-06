# Regras técnicas do projeto

- Limites de plano são calculados no banco pela função `assinatura_limites(company_id, modulo)` (plano + adicionais ativos) e barrados no app por `garantirLimite` em `src/lib/billing/limites.ts` — fonte única evita divergência entre telas.
- O valor mensal cobrado é sempre plano base + adicionais ativos não isentos (`subscription_total_cents` no banco, `asaas-create-checkout` na cobrança) — assinaturas isentas não geram cobrança.
- Adicional contratado no meio do ciclo gera `prorata_cents` (trigger em `subscription_addons`) cobrado uma única vez na próxima fatura; `prorata_billed_at` marca o que já foi cobrado, evitando cobrança repetida.
- Limites de colaboradores e unidades também são barrados no banco por constraint triggers (`dp_guard_limite_*`) usando `assinatura_limite_excedido` — o app não é a única defesa.
- Recontratação preserva identidade, documentos atuais e histórico; cargo, salário, benefícios e jornada são novos — evita condições defasadas.
- Rotina de banco só recebe `GRANT EXECUTE ... TO authenticated` quando o frontend a chama via `supabase.rpc`, quando uma RLS policy a referencia ou quando um gatilho `SECURITY INVOKER` a usa; as demais ficam só com `service_role` — menor privilégio sem quebrar tela.
- `dp_ficha_aplicar` é `SECURITY DEFINER` autorizada por `tem_permissao(company_id, 'dp.colaboradores', 'inclusao')`; `dp_colaboradores` segue sem gravação direta para `authenticated` — aplicação atômica sem reabrir acesso amplo.
- Filtros `in`/`not.in` do PostgREST vão sempre entre parênteses ("(a,b)") — sem eles a consulta aborta (PGRST100) e a tela fica vazia.
- O portal não lê `dp_colaboradores` de colegas: `dp_portal_equipe_unidade()` expõe só nome, função e folga fixa da unidade — preserva privacidade.
- Na pré-admissão, o checklist compartilhado governa leitura e envio; desativar requisitos preserva anexos históricos — evita divergência na validação.

- Imagem da assinatura (PNG em data URL) é gravada só pelo servidor em `assinatura_imagem` (dp_recibos/dp_documento_aceites), imutável, e estampada no PDF com rubrica em todas as páginas — reimpressão fiel.

- Notificações push (Web Push): fila `dp_push_fila` alimentada por gatilho em `dp_notificacoes`, envio por `dp-push-dispatch` a cada minuto e receptor isolado em `/push/sw.js` (sem cache) — separado do worker de limpeza `/sw.js`.
- Disciplinar: o portal só lê vias físicas assinadas (`via_assinada_path`, advertência escrita/suspensão) via `dp_portal_meus_disciplinares()`; verbais, observações e minutas ficam no dossiê interno da ficha — evita expor anotações do gestor e passivo de dano moral.
- Elogio: visibilidade privado/individual/público definida só pela RPC `dp_elogio_divulgar` (notifica o colaborador e, se público, publica no Mural da unidade via `dp_avisos`); verbais e observações nunca notificam o colaborador — reconhecimento sem expor o dossiê.
- Piso do cargo: com sindicato patronal na unidade grava no patronal (convenção); sem patronal grava direto na unidade (Cargo + Unidade) — o patronal acelera, nunca bloqueia.
- Histórico da ficha de registro (férias, afastamentos, advertências) é lido por `dp-ficha-historico-varrer` e só entra nos módulos pela RPC idempotente `dp_ficha_historico_aplicar` após conferência; afastamentos e advertências ficam no dossiê interno sem notificar o colaborador — evita alertas falsos.
- Importação de ficha: regime, forma de pagamento, cargo (com CBO), salário padrão da unidade/convenção e dependentes são sugeridos pela própria ficha e gravados só quando o gestor aprova; unidade com 20+ ativos exige justificativa para dispensar o ponto (Art. 74 CLT).
- Ponto (Art. 74 CLT) é decisão da unidade: `dp_unidade_definir_ponto` liga/desliga com cascata nos colaboradores e exige justificativa da unidade acima de 20 ativos; a ficha só pede justificativa individual quando a unidade tem ponto; unidade 20+ sem ponto e sem justificativa vira pendência e alerta no início.
- Divergência com a Ficha de Registro: qualquer cargo, salário, vínculo, forma de pagamento ou horário gravado diferente da ficha de origem exige justificativa (mín. 15) e ciência, registradas via `registrarCienciaRegra` (`src/lib/dp/ficha-registro/divergencia.ts`) — a ficha é registro contábil (CTPS/eSocial).
- Folga dominical diferenciada: exceção do colaborador (`dp_colaboradores.domingos_folga_mes`) > regra do cargo na unidade (`dp_folga_domingo_cargos`) > regra da unidade (homens/mulheres), via `domingosDiferenciados`; gravada só por RPC com ciência de isonomia (`folga-isonomia.ts`) — sem diferenciação sem registro.
- Desligamento: Aviso, Documentos e Acerto Rescisório com pendências próprias; sem assinatura digital; Acerto só baixa assinado ou com comprovante — emitir não quita.
- Restrição de um dia: colaborador → `dp_bloqueios` (início=fim); cargo/setor → `dp_folga_limite_regras` com vigência de um dia (máximo 0 = ninguém) — reaproveita validações oficiais.
