# Catálogo Stripe do Foro (SOMENTE SANDBOX)

Importe no Postman: `foro-stripe-catalogo-sandbox.postman_collection.json` e `foro-stripe-sandbox.postman_environment.json`.

1. No environment, preencha `stripe_secret_key` (sk_test_...) apenas localmente. Chaves live são bloqueadas.
2. Rode "Criar produto Foro" (uma vez) → grava `stripe_product_id`.
3. Rode 00, 01, depois 02/03/04 (Starter 12990, Pro 19990, Business 39990 centavos) e 05 para conferir.

Preços do Stripe são imutáveis: para alterar, crie `..._v2` e arquive o antigo. O teste grátis de 14 dias é controlado pelo app; consultas extras não são vendidas no Stripe por ora.
