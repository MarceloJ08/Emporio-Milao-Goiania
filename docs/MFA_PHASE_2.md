# MFA — Fase 2

A homologação em ambiente isolado foi encerrada. Foram validados no navegador os quatro defeitos de autorização, confirmação de cadastro, polling e apresentação do onboarding. Administradores e funcionários usam MFA obrigatório para operações privilegiadas. Clientes mantêm MFA opcional e checkout sem MFA. A leitura de pedidos e itens respeitou os vínculos esperados. A atualização do ADM por polling foi validada.

A Edge Function aceitou a sessão administrativa AAL2 (HTTP 200) e rejeitou o administrador AAL1 e o cliente AAL2 (HTTP 403). O cenário positivo operou sobre imagens já centralizadas. A recuperação em outro dispositivo com TOTP exigiu o fator, invalidou a senha anterior e preservou o autenticador.

A migration requer catálogo conciliado do alvo e aprovação do transporte. O corte é coordenado com o frontend, que precisa do RPC account_mfa_requirements. O acesso deriva de autorização de banco e da sessão validada, sem depender de metadados editáveis. A migration não altera templates, SMTP, CAPTCHA, fatores ou senhas. Execução e reversão em produção requerem autorização explícita e arquivos operacionais privados.
