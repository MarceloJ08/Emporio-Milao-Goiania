# Configuração do Supabase — Empório Milão

## Conexão já aplicada

- Projeto: `emporio-milao-goiania`
- Região: `sa-east-1`
- Frontend: `index.html`
- SDK: `@supabase/supabase-js@2.119.0`
- A chave publishable fica no frontend; nenhuma chave `service_role` ou secret foi publicada.

## O que foi criado no banco

- `public.profiles`: cadastro vinculado ao usuário do Supabase Auth.
- `public.products`: catálogo ativo, com leitura pública e escrita restrita a administradores.
- `public.orders`: pedidos, endereço, forma de pagamento, status e total.
- `public.order_items`: itens e preços registrados no momento do pedido.
- `private.admin_users`: lista de usuários com permissão administrativa.
- `public.create_order(...)`: função que valida a sessão, consulta preços no banco e registra pedido e itens.
- RLS habilitado nas quatro tabelas públicas.

## Ativação do login por telefone

No painel do Supabase, abra **Authentication → Sign In / Providers → Phone**:

1. Ative o provedor Phone.
2. Configure um provedor de SMS e suas credenciais.
3. Defina se a confirmação por SMS será obrigatória.
4. Configure os limites de envio e os modelos de mensagem.

O frontend usa telefone brasileiro no padrão E.164 (`+55...`) e senha. Se a confirmação de telefone estiver ativa, o cliente só poderá entrar depois de confirmar o código SMS. O envio real de SMS depende das credenciais do provedor configuradas no painel.

## Dar acesso administrativo ao proprietário

1. Crie a conta do proprietário pelo formulário do site, usando o telefone empresarial correto.
2. Confirme o SMS e entre nessa conta ao menos uma vez.
3. No **SQL Editor** do Supabase, execute o comando abaixo, substituindo o telefone pelo telefone da conta que acabou de ser criada:

```sql
insert into private.admin_users (user_id)
select id
from auth.users
where phone = '+55DDDNÚMERO'
on conflict (user_id) do nothing;
```

4. Atualize o site e entre novamente. O botão **Painel administrativo** aparecerá somente para esse usuário.

A autorização não depende de telefone digitado no navegador nem de `user_metadata`; ela é verificada no banco por uma lista privada de UUIDs de usuários.

## Testes realizados

- Projeto Supabase: ativo e saudável.
- Tabelas e colunas: conferidas após a migração.
- RLS: habilitado nas quatro tabelas públicas.
- Catálogo: 9 produtos iniciais inseridos e leitura pública testada com o papel `anon`.
- Acesso de administrador: consulta protegida por função no banco; nenhum usuário foi promovido automaticamente.
- Pedido: a função exige usuário autenticado e valida endereço, telefone, forma de pagamento, produtos ativos e quantidades. O total é calculado usando os preços do banco, não o valor enviado pelo navegador.
- Segurança: nenhuma chave secreta foi incluída no HTML.

## Pendências antes de operar com clientes

- Configurar e testar o provedor de SMS no painel do Supabase.
- Criar a conta do proprietário e inserir seu UUID em `private.admin_users`.
- Fazer um teste real de cadastro, login e pedido com um telefone autorizado.
- Substituir/completar os 9 itens iniciais pela exportação integral e conferida do cardápio oficial. O catálogo atual ainda não representa todo o estoque do Empório.
- Confirmar horários, preços e disponibilidade com a loja.

O site registra o pedido no Supabase e depois abre o WhatsApp **(62) 3636-7239** com o resumo. O registro no banco ocorre antes de abrir o WhatsApp.
