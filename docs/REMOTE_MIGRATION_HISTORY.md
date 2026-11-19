# Histórico remoto de migrations do Supabase

Consulta ao histórico do projeto em 19/11/2026. O banco remoto registra **23 migrations aplicadas**.

## Scripts atualmente versionados no repositório

- `20261116205431_emporio_store_core.sql`
- `20261116205726_harden_order_rpc.sql`
- `20261118210022_add_admin_store_settings.sql`
- `20261118210302_restrict_anonymous_customer_data_access.sql`
- `20261119023414_harden_private_admin_users.sql`
- `20261119023657_harden_private_sales_staff.sql`
- `20261119220057_enable_realtime_orders_for_admin_dashboard.sql`
- `20261119220124_add_confirmed_order_count_to_admin_finance_summary.sql`

## Histórico remoto completo

| Versão | Migration | Script no GitHub |
|---|---|---|
| 20261116205431 | emporio_store_core | Sim |
| 20261116205726 | harden_order_rpc | Sim |
| 20261118210022 | add_admin_store_settings | Sim |
| 20261118210302 | restrict_anonymous_customer_data_access | Sim |
| 20261118215500 | customer_account_persistence | Não |
| 20261118220002 | product_offer_price | Não |
| 20261118220824 | admin_finance_inventory_controls | Não |
| 20261118221214 | admin_finance_summary_rpc | Não |
| 20261118221503 | index_inventory_movement_history | Não |
| 20261118221550 | automatic_inventory_on_order_dispatch | Não |
| 20261118221612 | make_order_stock_movements_idempotent | Não |
| 20261119022111 | assisted_sales_and_store_inventory | Não |
| 20261119022124 | sales_order_snapshots_and_finance | Não |
| 20261119022134 | salesperson_snapshot_on_orders | Não |
| 20261119022230 | secure_sales_staff_access_check | Não |
| 20261119022314 | isolate_privileged_sales_functions | Não |
| 20261119022336 | prevent_double_stock_deduction_for_assisted_sales | Não |
| 20261119022410 | grant_admin_branch_stock_upsert | Não |
| 20261119022450 | link_assisted_sales_to_registered_customers | Não |
| 20261119023414 | harden_private_admin_users | Sim |
| 20261119023657 | harden_private_sales_staff | Sim |
| 20261119220057 | enable_realtime_orders_for_admin_dashboard | Sim |
| 20261119220124 | add_confirmed_order_count_to_admin_finance_summary | Sim |

## Importante
O banco de produção contém todas as migrations listadas, mas **15 scripts históricos ainda não estão arquivados no GitHub**. Não recriei esses arquivos com SQL inventado. O sistema de produção permanece íntegro; entretanto, para reconstruir o banco do zero em outro projeto, será necessário recuperar/reconstruir e revisar os 15 scripts ausentes a partir do histórico de desenvolvimento e do schema atual.

Não reaplique migrations já registradas no projeto remoto. Antes de qualquer ambiente novo, gerar e revisar um baseline completo e testá-lo em um projeto separado.

- `20261119190000_product_image_storage_and_store_addresses.sql` — bucket público `product-images` com leitura pública e escrita restrita a administradores; atualização dos endereços das três unidades.


## Central administrativa organizada e atualização ao vivo

- `20261119220057_enable_realtime_orders_for_admin_dashboard.sql` habilita eventos Realtime da tabela `public.orders` para o painel administrativo.
- `20261119220124_add_confirmed_order_count_to_admin_finance_summary.sql` adiciona ao resumo financeiro a contagem global de pedidos confirmados/em andamento, mantendo a autorização exclusiva para administradores.
