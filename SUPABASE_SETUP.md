# Configuração do Supabase — Empório Milão

## Projeto
- Supabase project ref: `[referência de produção omitida deste repositório público]`.
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

## Cadastro público — configuração e validação pendentes

Faça primeiro no projeto isolado de staging. O frontend clonado aponta para o Supabase publicado. Para ensaios reais, configure uma cópia da aplicação com URL e chave publishable de staging, sem versionar credenciais privadas.

1. **Authentication → Sign In / Providers → Email**, seção **Password Security**. Mantenha o cadastro público e o provedor Email ativos. Ative **Confirm email** e revise a validade do OTP/link (a recomendação do Supabase é até 3.600 segundos; a configuração também afeta outros links do Auth). Defina mínimo de 12 caracteres e a opção de exigir letras minúsculas, maiúsculas, números e símbolos. O formulário aceita colagem, gerenciadores e até 72 bytes UTF-8. Confira a regra efetiva com uma solicitação direta autorizada em staging. [Segurança de senhas](https://supabase.com/docs/guides/auth/password-security)
2. Em **Password Security**, habilite **Prevent use of leaked passwords** se o plano for Pro ou superior. No Free, mantenha comprimento, verificação de e-mail e limites no servidor. A proteção contra senhas comprometidas continua pendente até haver suporte configurado. Confirme o plano e o estado da opção.
3. **Authentication → URL Configuration**. Use a raiz do domínio oficial em **Site URL**. Em **Redirect URLs**, autorize a URL exata de confirmação de cada ambiente, como `https://emporio-milao-goiania.vercel.app/?cadastro=confirmacao` no projeto de produção e o equivalente no domínio de staging. Se o painel pedir o caminho sem a query, confirme que o retorno preserva `cadastro=confirmacao`. Preserve os retornos legítimos de recuperação existentes e remova curingas amplos após inventariá-los. Em **Authentication → Email Templates → Confirm signup**, confira o link padrão `{{ .ConfirmationURL }}`. Em staging, verifique confirmação, expiração, reenvio e o retorno ao domínio esperado. [Redirecionamentos](https://supabase.com/docs/guides/auth/redirect-urls)
4. **Authentication → Rate Limits** e **Authentication → SMTP Settings**. Confira limites por IP, intervalo de confirmação/reenvio e cota global. O provedor padrão documenta 2 e-mails por hora por projeto e limita destinatários à equipe do projeto. Configure SMTP aprovado para a loja pública. Registre os valores reais. Avalie Turnstile ou hCaptcha em **Project Settings → Authentication → Bot and Abuse Protection**. Antes de habilitar, integre e valide o token em todos os fluxos Auth afetados. Habilitar apenas no painel pode interromper fluxos. [Limites](https://supabase.com/docs/guides/auth/rate-limits) · [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
5. Revise o esquema de staging e aplique a migration de cadastro somente após confirmar a presença de `private.sales_staff` e o trigger de criação de perfil. Para provisionar equipe, crie ou convide pelo Auth com `full_name`, confirme a identidade e o e-mail, e então conceda acesso pelo ADM. Para administradores, conceda acesso por UUID em `private.admin_users` por operação administrativa autorizada. Revise entradas reservadas sem usuário e a rotina de convite antes de aplicar. O trigger impede novas contas com um e-mail já listado, inclusive por provisionamento administrativo.
6. Com aprovação prévia e endereço controlado, teste em staging ambos os formulários: criação, link recebido, confirmação, link inválido/expirado e reenvio. Confirme que o usuário pendente não tem sessão e que o cliente confirmado não passa nas verificações administrativas e de vendas. Verifique no Auth que senha fora da política e campos inválidos são recusados sem depender do formulário. Compare as respostas de duplicidade e confirme a limitação de reenvio com o menor número de tentativas possível. Registre códigos e resultados sem senhas, tokens ou endereços pessoais.

## Alteração e recuperação de senha

- Em **Authentication → Sign In / Providers → Email**, teste **Secure password change** com uma sessão recente e outra com mais de 24 horas em staging. Para a mais antiga, o formulário permite solicitar o código com `reauthenticate()` e enviá-lo como `nonce`. Confira o template **Reauthentication** com `{{ .Token }}` e a entrega pelo SMTP. Teste código correto, incorreto, expirado e reenvio.
- Teste **Require current password when updating** com senha atual correta, incorreta e ausente. O SDK envia o campo `current_password`. Teste também as duas opções juntas, com senha atual e código na mesma requisição.
- Para recuperação, autorize o retorno exato `/?senha=recuperar` no domínio de staging e confira o template **Reset password** com `{{ .ConfirmationURL }}`. Solicite e abra o link no mesmo navegador e perfil, pela mesma origem. O fluxo usa PKCE e envia apenas a nova senha ao Auth. Confirme que o servidor do projeto reconhece a sessão PKCE como recuperação e aceita a troca com a segunda opção ativa. Links antigos emitidos no fluxo implícito podem precisar ser substituídos.
- As opções do painel e a entrega de e-mail dependem de confirmação em staging. Testes locais: `node --test tests/password.test.mjs`.

## Experimento TokenHash em desenvolvimento ou staging

1. Use um projeto Supabase separado com contas fictícias. Em uma cópia isolada do frontend, defina `tokenHashStaging` em `src/js/auth-staging.mjs` com `{ origin, supabaseUrl, publishableKey }`. Use a origem exata da cópia, por exemplo `http://localhost:4173`, e a URL e chave publishable do projeto de teste. O repositório vem com configuração nula. O código rejeita o domínio publicado e o backend de produção para o experimento.
2. Em **Authentication → URL Configuration**, autorize a URL exata de retorno da cópia, por exemplo `http://localhost:4173/?senha=recuperar`. Em **Email Templates → Reset password**, aplique apenas a troca de link descrita em [reset-password-staging.md](templates/reset-password-staging.md). Mantenha o SMTP configurado e os templates de cadastro e reautenticação.
3. Use uma conta de teste autorizada. Valide Chrome desktop → celular, Chrome → Gmail interno, Android e iOS. Abra um link sem clicar no botão, depois valide o clique, links expirados, inválidos e reutilizados, preservação da sessão de uma segunda conta e bloqueio de ADM/vendas durante a recuperação. Confirme com **Secure password change** e **Require current password when updating** ativos que a recuperação aceita a nova senha, a antiga falha ao entrar e a alteração comum continua exigindo senha atual. Para sessão comum antiga, valide também o desafio de reautenticação. Use somente códigos de erro sanitizados como evidência.
4. Durante a transição, links PKCE já emitidos continuam aceitos se o navegador original ainda tiver o verificador. Links implícitos antigos com sessão no fragmento solicitam um novo link, sem importar essa sessão no cliente principal.
5. Para reverter em staging, restaure primeiro o link `{{ .ConfirmationURL }}` no template. Mantenha o projeto de staging e o mesmo `origin` no frontend, voltando à versão PKCE apontada para esse projeto. Solicite novos links após a reversão. Links TokenHash já emitidos podem deixar de abrir no frontend revertido.

## Pendências operacionais
- Habilitar MFA para as contas administrativas, se disponível no plano/configuração adotada.
- Tornar o repositório GitHub privado e limitar colaboradores.
- Cadastrar os e-mails corporativos individuais das assistentes e definir seus limites de desconto no ADM.
- Importar planilha oficial dos produtos e quantidades reais de cada uma das três lojas e do galpão.
- Testar cadastro, login, lançamento, cancelamento e movimentações com contas de teste antes da operação.

Nunca inserir senhas, tokens, service-role/secret keys, dados pessoais de clientes ou planilhas de estoque neste repositório.
