ALTER FUNCTION public.categorize_transaction(text,text,text,uuid,uuid,numeric) SET search_path = public, extensions;
ALTER FUNCTION public.pay_credit_card_invoice(uuid,numeric,uuid,date,text) SET search_path = public, extensions;
ALTER FUNCTION public.enqueue_uncategorized_for_ai(integer,text,uuid) SET search_path = public, extensions;