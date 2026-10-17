-- شغّله في Supabase SQL Editor: لازم يرجّع الدالتين
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('create_sale', 'create_purchase_order');
