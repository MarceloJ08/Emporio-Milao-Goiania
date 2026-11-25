# MFA no Empório Milão

A Fase 1 oferece TOTP opcional em **Minha conta → Configurações da conta → Segurança da conta**. O Supabase gera o QR Code e a chave manual. O Empório apresenta esses dados apenas durante a configuração. O aplicativo aceita até três fatores, contando os pendentes, e permite excluir uma configuração incompleta e iniciá-la de novo.

Quando existe um fator verificado, a loja só libera perfil, pedidos e painéis após a sessão atingir AAL2. A loja consulta o nível da sessão e os fatores no Supabase Auth. O cadastro da conta e o Turnstile mantêm os fluxos existentes. O link de recuperação estabelece uma sessão isolada. Contas com MFA confirmam o TOTP nessa sessão antes de redefinir a senha. Depois, o fluxo encerra a sessão de recuperação e mantém os fatores existentes.

## Perda do autenticador

1. Use o autenticador de reserva para entrar. Cadastre e verifique o novo dispositivo antes de remover o fator perdido.
2. Caso tenha uma sessão já verificada e só tenha perdido um dos dispositivos cadastrados, use o fator restante para confirmar a remoção.
3. Caso tenha perdido todos os fatores, encaminhe o caso ao responsável pelo SaaS. A redefinição por e-mail não substitui a prova do segundo fator. Qualquer exceção administrativa deve seguir procedimento aprovado de verificação de identidade por canal independente e auditável. Para pessoal interno, use também o cadastro de funcionários e confirmação por responsável autorizado. Se a identidade não puder ser verificada, mantenha os fatores. A API administrativa de remoção, se adotada nesse procedimento, deve operar em ambiente privilegiado, com registro da autorização, revogação de sessões, notificação e novo cadastro de TOTP. Nenhum mecanismo de exceção foi implementado.
4. Incentive quem habilita MFA a verificar um segundo autenticador em outro dispositivo. A Fase 1 não gera códigos de recuperação.

## Validação real antes da publicação

Use contas de teste em um Supabase de teste com TOTP habilitado, limite 3 e as mesmas regras de duração de AAL1. Verifique a leitura do QR Code ou chave manual em dispositivos reais, a expiração de uma sessão durante a etapa de TOTP, a redefinição da senha por e-mail com MFA e o acesso aos dois painéis. Confirme também como a plataforma trata a remoção do último fator e a invalidação de outras sessões após verificar um fator.

## Fase 2

- Inventariar as operações internas e as respectivas roles, RLS, views, RPCs, Storage, Realtime e Edge Functions. Auditar funções SECURITY DEFINER e seus grants e caminhos de execução.
- Exigir AAL2 no servidor para funcionários e administradores conforme política aprovada, em conjunto com a autorização de função existente. Usar a claim assinada aal do Supabase em RLS e verificações equivalentes nas RPCs e demais serviços privilegiados. A visibilidade do menu é apenas um controle da interface.
- Definir a transição de usuários privilegiados sem fatores, a política para perda de dispositivo, a revogação de sessões e o procedimento de rollback. Preservar o acesso público ao catálogo e os fluxos de clientes.
- Testar em staging contas sem fator, AAL1 com fator, AAL2 com e sem permissão para cada operação, alteração de fatores, revogação e regressões em dados de clientes. Validar as operações pelo backend antes da adoção.
