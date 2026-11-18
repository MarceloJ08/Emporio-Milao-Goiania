# Configuração do Supabase — Empório Milão

## Conexão
- Projeto: `emporio-milao-goiania` (região `sa-east-1`).
- Frontend: `index.html`.
- SDK: `@supabase/supabase-js@2.119.0`.
- O frontend usa somente a chave publishable. Nenhuma chave `service_role` ou secret foi publicada.

## Backend e permissões
- `public.profiles`: perfil vinculado ao usuário autenticado.
- `public.products`: catálogo público para leitura; criação, edição e publicação restritas ao administrador.
- `public.orders`: pedidos vinculados ao UUID do cliente; cada cliente consulta apenas os próprios pedidos.
- `public.order_items`: itens acessíveis somente ao dono do pedido ou ao administrador.
- `private.admin_users`: lista privada de UUIDs autorizados como administradores.
- `public.store_settings`: nome, mensagem do topo, WhatsApp e horários. A leitura é pública; a alteração é exclusiva do administrador.
- `public.create_order(...)`: valida a sessão, endereço, telefone, pagamento, produtos ativos e quantidades; calcula o total usando os preços do banco.
- RLS habilitado nas tabelas públicas. A autorização administrativa é conferida no banco, não por um botão ou campo do navegador.

## Área do cliente
Após entrar na conta, o cliente consegue consultar seu histórico de pedidos. A consulta também filtra pelo próprio UUID e é protegida por RLS.

## Painel administrativo
O painel apresenta indicadores, pedidos, clientes cadastrados, atualização do status dos pedidos, cadastro/edição de produtos, publicação/ocultação de produtos e configurações da loja. Todas as gravações administrativas são validadas por políticas RLS no banco.

## Ativar login por telefone
No Supabase, abra **Authentication → Sign In / Providers → Phone**:
1. Ative o provedor Phone.
2. Configure um provedor de SMS e suas credenciais.
3. Defina se a confirmação por SMS será obrigatória.
4. Configure limites de envio e modelos de mensagem.

O frontend usa telefone brasileiro em E.164 (`+55...`) e senha. O envio real de SMS depende do provedor configurado no painel.

## Liberar o proprietário como administrador
1. Cadastre a conta do proprietário pelo site usando o telefone empresarial **(62) 98574-3549**.
2. Confirme o SMS, se a confirmação estiver ativada, e entre na conta ao menos uma vez.
3. No SQL Editor do Supabase, execute:

```sql
insert into private.admin_users (user_id)
select id
from auth.users
where phone = '+5562985743549'
on conflict (user_id) do nothing;
```

4. Saia e entre novamente no site. O botão **Painel administrativo** será exibido para essa conta.

**Estado verificado em 18/11/2026:** a tabela `private.admin_users` estava vazia e ainda não havia conta Auth com esse telefone. Portanto, o painel está implementado, mas o acesso do proprietário depende de concluir os passos acima. Nenhum usuário foi promovido automaticamente.

## Verificações e pendências
- Projeto Supabase ativo e saudável.
- RLS habilitado em `profiles`, `products`, `orders`, `order_items` e `store_settings`.
- Nove produtos iniciais no catálogo; a lista ainda precisa ser completada com o catálogo oficial conferido.
- Configurar e testar o provedor SMS.
- Criar a conta do proprietário e executar o SQL de autorização.
- Fazer testes reais de cadastro, login, pedido e atualização de status.
- Confirmar preços, estoque, horários e condições com a loja.

O pedido é gravado no Supabase antes de abrir o WhatsApp **(62) 3636-7239** com o resumo.
