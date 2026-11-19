# Segurança — Empório Milão

## Fronteira pública x privada
A vitrine, o catálogo ativo e as informações comerciais necessárias à compra são públicos. Não tornar a loja inteira privada: isso bloquearia os clientes. O painel administrativo, a operação de vendas assistidas, os dados de clientes, pedidos, preços internos e estoques são protegidos por autenticação e autorização no banco.

## Identidades e permissões
- Cada administrador e atendente deve usar uma conta individual; não compartilhar credenciais.
- A lista de administradores fica em `private.admin_users`; a lista de atendentes fica em `private.sales_staff`.
- A autorização é verificada no backend por funções privadas e RLS, não por esconder botões no navegador.
- O atendente deve acessar somente os fluxos e registros autorizados; a equipe não deve receber privilégios administrativos.
- Revogar/bloquear o atendente na allowlist interrompe novas operações após a sessão/token ser renovado; para revogação imediata de sessões já abertas, revogar sessões no Auth também.

## Segredos e repositório
- Nunca versionar senhas, tokens, service-role/secret keys, arquivos .env ou planilhas operacionais.
- A chave publishable/anon usada pelo frontend não é um segredo; RLS e grants são a barreira real.
- O repositório deve ser configurado como **Private** no GitHub e o acesso concedido somente a pessoas nominalmente autorizadas. A conexão Vercel-GitHub deve ser testada após essa alteração.
- Proteger a branch `main`: exigir revisão, impedir force-push e exclusão, e restringir quem pode publicar.

## Vercel
- SSO/Deployment Protection está habilitado para deployments abrangidos pela configuração atual.
- Não aplicar proteção por senha ao domínio público da loja, pois o catálogo é destinado a clientes.
- Manter previews protegidos por SSO e revisar acessos do time.

## Supabase Auth
- Exigir confirmação de e-mail para contas internas.
- Usar senhas exclusivas e fortes, MFA para administradores quando disponível, e revogar sessões ao desligar um funcionário.
- Ativar proteção contra senhas vazadas no painel Supabase Auth.
- Revisar limites de tentativas, CAPTCHA/rate limits e templates de e-mail.
- Não usar metadados editáveis pelo usuário para decidir privilégios.

## Estoque e planilhas
- Importar apenas planilhas oficiais e validadas; não inferir quantidades.
- Manter estoque do galpão e estoque de cada unidade separados.
- Restringir importação/ajustes a administradores designados e registrar origem, autor e data de cada carga.
