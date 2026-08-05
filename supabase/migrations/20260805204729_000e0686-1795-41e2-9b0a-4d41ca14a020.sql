GRANT EXECUTE ON FUNCTION public.ped_worker_nonce_issue(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.ped_worker_nonce_consume(text, text) TO postgres;
GRANT ALL ON public.ped_worker_nonces TO postgres;