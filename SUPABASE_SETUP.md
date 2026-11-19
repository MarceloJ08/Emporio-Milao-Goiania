# Configuração do Supabase — Empório Milão

## Projeto
- Supabase project ref: `khbcqvuaqmzxlmaayfla`.
- Região: `sa-east-1`.
- SDK frontend: `@supabase/supabase-js@2.119.0`.
- O navegador usa apenas a chave publishable. A service-role/secret key nunca deve ir para o frontend ou GitHub.

## Autenticação
- Login interno por e-mail e senha.
- Cada funcionário deve ter conta individual, com e-mail corporativo próprio e confirmação de e-mail habilitada.
- Não compartilhar contas entre assistentes.
- A lista de atendentes autorizados é administrada no painel ADM e validada no banco.
- A lista de administradores fica no schema não exposto `private`.

## Segurança de dados
- RLS está habilitado nas tabelas do schema público.
- Perfis, pedidos e itens são filtrados por proprietário, atendente autorizado ou administrador, conforme a função.
- Estoque do galpão e estoque por unidade são dados internos.
- Funções privilegiadas devem permanecer no schema `private`, com EXECUTE concedido apenas aos papéis necessários.
- As tabelas `private.admin_users` e `private.sales_staff` usam RLS em modo FORCE e não concedem acesso direto a anon/authenticated; a autorização/gestão ocorre por funções privadas controladas.

## Áreas
- Loja pública: `/`.
- Painel administrativo: `/?admin=1`.
- Vendas assistidas: `/?vendas=1`.

## Migrações
As migrações aplicadas ao banco são registradas no histórico do Supabase. Os arquivos versionados em `supabase/migrations/` devem ser mantidos alinhados ao banco real. Antes de criar uma migration nova, consultar o histórico remoto e não reaplicar versões existentes.

## Pendências operacionais
- Ativar a opção `Prevent use of leaked passwords` em Authentication → Sign In / Providers → Email. A documentação do Supabase informa que essa proteção via HaveIBeenPwned está disponível no plano Pro ou superior; se o projeto estiver no Free, reforçar o mínimo de 8 caracteres e exigir maiúsculas, minúsculas, números e símbolos até eventual upgrade. O advisor permanece com aviso enquanto a função não estiver habilitada.
- Habilitar MFA para as contas administrativas, se disponível no plano/configuração adotada.
- Tornar o repositório GitHub privado e limitar colaboradores.
- Cadastrar os e-mails corporativos individuais das assistentes e definir seus limites de desconto no ADM.
- Importar planilha oficial dos produtos e quantidades reais de cada uma das três lojas e do galpão.
- Testar cadastro, login, lançamento, cancelamento e movimentações com contas de teste antes da operação.

Nunca inserir senhas, tokens, service-role/secret keys, dados pessoais de clientes ou planilhas de estoque neste repositório.
