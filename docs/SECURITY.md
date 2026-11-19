# Segurança — Empório Milão

## Fronteira pública x privada
A vitrine, o catálogo ativo e as informações comerciais necessárias à compra são públicos. Não tornar a loja inteira privada: isso bloquearia os clientes. O painel administrativo, a operação de vendas assistidas, os dados de clientes, pedidos, preços internos e estoques são protegidos por autenticação e autorização no banco.

## Identidades e permissões
- Cada administrador e atendente deve usar uma conta individual; não compartilhar credenciais.
- A lista de administradores fica em `private.admin_users`; a lista de atendentes fica em `private.sales_staff`. Ambas usam RLS em modo FORCE e não concedem acesso direto às roles `anon`/`authenticated`; a gestão ocorre somente por funções privadas autorizadas.
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

## Privilégios mínimos e recuperação de conta
- As tabelas do schema `public` concedem somente operações necessárias às funções da loja; roles públicas não recebem privilégios de escrita sobre pedidos, perfis, estoque ou tabelas internas.
- RLS continua habilitado nas tabelas. Grants SQL e políticas RLS atuam em conjunto: conceder uma operação não permite ultrapassar as políticas por linha.
- Índices foram adicionados para chaves estrangeiras usadas em relacionamentos de pedidos e estoque.
- A recuperação de senha usa link de uso único enviado ao e-mail cadastrado; a senha só é alterada após validação do link pelo Supabase Auth. Não há SMS habilitado.
- Novos cadastros e redefinições exigem senha de pelo menos 12 caracteres na interface. O Supabase Auth continua aplicando seus próprios limites de envio e tentativas; não desativar rate limits nem controles antiabuso.
- O alerta de proteção contra senhas vazadas ainda precisa ser habilitado em Supabase Dashboard → Authentication → Settings → Password Security. Não declarar a configuração concluída até confirmar no painel.
- O repositório foi verificado como público. Torná-lo privado no GitHub (Settings → General → Danger Zone → Change visibility) e revisar os colaboradores. O código enviado ao navegador continua sendo inspecionável; regras sigilosas e segredos devem permanecer no banco/funções server-side.


## Atualização de novembro de 2026
- Perfis: SELECT limitado ao próprio usuário ou administrador; UPDATE limitado ao próprio usuário.
- Pedidos: SELECT limitado ao cliente proprietário, atendente responsável ou administrador; atualização de pedidos limitada ao administrador.
- Itens de pedidos: leitura herdada da autorização do pedido pai.
- Carrinhos: leitura, inserção e atualização limitadas ao próprio usuário autenticado.
- Imagens de produtos: bucket público somente para leitura; inserção, substituição e exclusão restritas a administradores autenticados.
- Upload de imagens aceita JPG, PNG e WEBP até 8 MB. A função de importação automática exige JWT válido e confirma a permissão administrativa no banco; domínios externos são allowlisted para reduzir risco de SSRF.
- Formulários de cadastro, redefinição e alteração de senha exigem 12 caracteres, letras maiúsculas e minúsculas, número e símbolo no frontend. **A regra de complexidade no frontend não substitui a política server-side do Supabase Auth**: habilitar também a exigência de 12 caracteres e proteção contra senhas vazadas em Authentication → Settings → Password Security.
- Endereços das três unidades foram adicionados a `public.store_locations`; a vitrine mostra endereços e links de rota.
- Não expor chaves `service_role` no navegador. A função de importação usa a chave privilegiada somente em ambiente server-side.
