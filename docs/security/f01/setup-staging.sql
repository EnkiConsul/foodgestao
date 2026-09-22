-- SOMENTE HOMOLOGACAO utjhzpdbqzajrhnzcher. Fixture sintetica, nunca producao.
BEGIN;
CREATE TEMP TABLE f01_fixture_result(data jsonb) ON COMMIT DROP;
DO $$
DECLARE
 a uuid; d uuid; ca uuid; cb uuid;
 aa uuid; aa2 uuid; ab uuid; pa uuid; pd uuid;
 ka uuid; kb uuid; kpa uuid; kpd uuid;
BEGIN
 SELECT id INTO STRICT a FROM auth.users WHERE email='l01-a@example.invalid';
 SELECT id INTO STRICT d FROM auth.users WHERE email='l01-d@example.invalid';
 INSERT INTO public.companies(user_id,name) VALUES(a,'F01-20260922-A') RETURNING id INTO ca;
 INSERT INTO public.companies(user_id,name) VALUES(d,'F01-20260922-B') RETURNING id INTO cb;
 INSERT INTO public.company_members(company_id,user_id,role,permissions)
 VALUES(cb,a,'viewer','{"transactions":"view","accounts":"view"}'::jsonb)
 ON CONFLICT(company_id,user_id) DO NOTHING;
 INSERT INTO public.accounts(user_id,company_id,context,name,account_type) VALUES(a,ca,'pj','F01-A','corrente') RETURNING id INTO aa;
 INSERT INTO public.accounts(user_id,company_id,context,name,account_type) VALUES(a,ca,'pj','F01-A2','corrente') RETURNING id INTO aa2;
 INSERT INTO public.accounts(user_id,company_id,context,name,account_type) VALUES(d,cb,'pj','F01-B','corrente') RETURNING id INTO ab;
 INSERT INTO public.accounts(user_id,context,name,account_type) VALUES(a,'pf','F01-PFA','corrente') RETURNING id INTO pa;
 INSERT INTO public.accounts(user_id,context,name,account_type) VALUES(d,'pf','F01-PFD','corrente') RETURNING id INTO pd;
 INSERT INTO public.credit_cards(user_id,company_id,context,issuer,closing_day,due_day) VALUES(a,ca,'pj','F01-A',20,28) RETURNING id INTO ka;
 INSERT INTO public.credit_cards(user_id,company_id,context,issuer,closing_day,due_day) VALUES(d,cb,'pj','F01-B',20,28) RETURNING id INTO kb;
 INSERT INTO public.credit_cards(user_id,context,issuer,closing_day,due_day,is_corporate) VALUES(a,'pf','F01-PFA',20,28,false) RETURNING id INTO kpa;
 INSERT INTO public.credit_cards(user_id,context,issuer,closing_day,due_day,is_corporate) VALUES(d,'pf','F01-PFD',20,28,false) RETURNING id INTO kpd;
 INSERT INTO f01_fixture_result VALUES(jsonb_build_object('projectRef','utjhzpdbqzajrhnzcher','userA',a,'userD',d,'companyA',ca,'companyB',cb,'accountA',aa,'accountA2',aa2,'accountB',ab,'personalA',pa,'personalD',pd,'cardA',ka,'cardB',kb,'personalCardA',kpa,'personalCardD',kpd));
END $$;
SELECT data FROM f01_fixture_result;
COMMIT;
