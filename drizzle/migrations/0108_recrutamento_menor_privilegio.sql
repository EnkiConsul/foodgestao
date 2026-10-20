-- Menor privilégio nas tabelas do Recrutamento 360: remove privilégios herdados por padrão e regrava só os previstos.
REVOKE ALL ON public.recrutamento_liberacoes, public.recrutamento_vagas, public.recrutamento_candidatos,
  public.recrutamento_auth_desafios, public.recrutamento_aval_config, public.recrutamento_questoes,
  public.recrutamento_avaliacoes, public.recrutamento_avaliacao_itens, public.recrutamento_portais,
  public.recrutamento_talentos, public.recrutamento_consentimentos FROM anon, authenticated;
GRANT SELECT ON public.recrutamento_liberacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recrutamento_vagas TO authenticated;
GRANT SELECT, UPDATE ON public.recrutamento_candidatos TO authenticated;
GRANT SELECT ON public.recrutamento_avaliacoes TO authenticated;
GRANT SELECT, UPDATE ON public.recrutamento_portais TO authenticated;
GRANT SELECT ON public.recrutamento_talentos TO authenticated;