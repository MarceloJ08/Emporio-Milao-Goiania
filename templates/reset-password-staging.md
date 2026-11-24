# Reset password — experimento em staging

No template existente, altere apenas o endereço do botão de recuperação. Preserve o texto, as imagens e os estilos atuais. O layout ativo do e-mail é mantido no painel do Supabase.

```html
href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}"
```

`RedirectTo` deve ser a origem de staging seguida de `/?senha=recuperar`. O fragmento fica no navegador e não integra a requisição HTTP à página. Desative o rastreamento de cliques do SMTP para este e-mail. Atualize o template de staging depois de disponibilizar o frontend experimental nesse ambiente.
