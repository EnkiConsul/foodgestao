
-- Add payment_method_id to transactions
ALTER TABLE public.transactions
ADD COLUMN payment_method_id uuid REFERENCES public.payment_methods(id) DEFAULT NULL;

-- Add payment_method_id to bills
ALTER TABLE public.bills
ADD COLUMN payment_method_id uuid REFERENCES public.payment_methods(id) DEFAULT NULL;
