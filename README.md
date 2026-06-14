# Medeiros Advocacia — Site local

Projeto básico para um site de advocacia com registro por email/senha, área de contratação, suporte via WhatsApp e área PIX.

Como executar (desenvolvimento):

1. Instale dependências:

```bash
npm install
```

2. Rode em desenvolvimento:

```bash
npm run dev
```

Aplicação roda em `http://localhost:3000`.

Segurança e deploy:
- Em produção, defina `NODE_ENV=production` e `SESSION_SECRET` forte.
- Rode atrás de HTTPS (Nginx, Cloudflare, Let’s Encrypt) e ative `cookie.secure`.
- Considere usar um banco gerenciado (Postgres) e validar/filtrar entradas no backend.

Configurações de e-mail / recuperação de senha / confirmação de e-mail:
- Configure as variáveis de ambiente SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (true/false), `FROM_EMAIL`.
- Defina `APP_URL` para URLs de confirmação/redefinição quando em produção.

PIX e recibos:
- Chave PIX usada no site: `joaolucasayressoares953@gmail.com`. Se o usuário informar um e-mail, o recibo será enviado automaticamente.

Deploy (exemplo com Render.com):
1. Crie um novo Web Service no Render apontando para este repositório.
2. Comando de build: `npm install`
3. Comando de start: `npm start`
4. Adicione as variáveis de ambiente no dashboard: `NODE_ENV=production`, `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `APP_URL`.
5. Render provisiona HTTPS automaticamente; garanta `APP_URL` use `https://...`.

Observações de segurança adicionais:
- Habilite validação de e-mails em produção e verificação de documentos antes de prestar alguns serviços.
- Considere integração com gateway de pagamentos ou sistema bancário para conciliação e emissão de recibos fiscais.

CI/CD (GitHub Actions -> Render):
- Crie secrets no repositório: `RENDER_API_KEY` (sua API key do Render) e `RENDER_SERVICE_ID` (ID do serviço no Render).
- O workflow `.github/workflows/deploy-render.yml` já aciona um deploy quando houver push em `main`.

Deploy via Docker Compose (VPS):
- Exemplo: crie um Droplet/VM, instale Docker & Docker Compose e crie um arquivo `.env` com as variáveis necessárias (`SESSION_SECRET`, `APP_URL`, `SMTP_*`).
- Execute:

```bash
docker compose up -d --build
```

Gateway PIX / Cobrança (integração):
- O backend possui um endpoint `/api/gateway/create-charge` que atualmente usa um mock.
- Para integrar um provedor real, configure as variáveis de ambiente: `GATEWAY_PROVIDER`, `GATEWAY_ENDPOINT`, `GATEWAY_API_KEY`. Quando configuradas, o servidor tentará encaminhar a criação de cobrança para `GATEWAY_ENDPOINT` com `Authorization: Bearer GATEWAY_API_KEY`.
- Cada provedor tem sua própria API; implemente o mapeamento do payload de acordo com o provedor (o código já tenta inserir o retorno no banco e retornar um `qr` e `provider_id` se o provedor fornecer).

Observações finais:
- Lembre-se de definir `SESSION_SECRET` e variáveis SMTP/APP_URL em produção.
- Se quiser, posso: (A) configurar o deploy automático no seu repositório (preciso de acesso ou você adiciona os secrets), (B) integrar com um gateway PIX específico (diga qual), (C) melhorar ainda mais o front-end.

PIX:
- Chave PIX usada no site: `joaolucasayressoares953@gmail.com`.

Contato WhatsApp:
- Número direto: +55 63 99110-5288
# Adv