# LexContract

SaaS de gestão de contratos de prestação de serviços jurídicos para advogados autônomos e pequenos escritórios de advocacia.

## Visão geral

Escritórios de advocacia de pequeno porte costumam gerenciar clientes, contratos, modelos, documentos e cobranças em planilhas soltas, e-mail e papel — um processo lento, sujeito a erro humano e sem rastreabilidade. O **LexContract** centraliza esse fluxo em um único sistema: cada escritório (tenant) cadastra seus clientes, gera contratos a partir de modelos reutilizáveis, acompanha o ciclo de vida do contrato (rascunho → envio → assinatura → vigência → encerramento), anexa documentos, controla parcelas de pagamento e mantém um histórico de auditoria de tudo o que aconteceu.

O público-alvo são advogados autônomos e pequenos escritórios que precisam de organização e profissionalismo na gestão contratual sem a complexidade (ou o custo) de um ERP jurídico completo.

## Principais funcionalidades

Todos os itens abaixo existem no código atual (rotas, services e páginas correspondentes):

- **Autenticação** via e-mail/senha (JWT), com sessão validada em `GET /auth/me`.
- **RBAC por papel** (`ADMIN`, `LAWYER`, `ASSISTANT`), reforçado no backend.
- **Dashboard** com métricas operacionais, gráfico de contratos por status e indicadores financeiros.
- **Clientes** (pessoa física ou jurídica): cadastro, edição, busca e inativação/remoção.
- **Modelos de contrato**, com variáveis (`{{grupo.campo}}`) substituídas automaticamente na geração do texto.
- **Contratos**: criação a partir de um modelo, edição em rascunho com versionamento automático do conteúdo, e transições de status controladas (`RASCUNHO → ... → ATIVO/ENCERRADO/CANCELADO`).
- **Término e renovação**: `endDate` opcional no contrato, indicador de vencimento próximo e alerta automático (30 dias) via `Notification`, disparado por um cron diário no GitHub Actions.
- **Busca global** no topo do sistema (clientes, contratos, modelos, documentos e usuários) e **filtros avançados** em contratos (período de início/término, faixa de valor, cliente, status).
- **Aceite eletrônico** por link público de uso único (assinatura eletrônica simples, **não** ICP-Brasil), com token com hash, expiração, IP/data registrados pelo backend e vínculo com a versão exata do contrato.
- **Documentos**: upload, categorização e download de arquivos vinculados a um contrato.
- **Pagamentos**: parcelas por contrato, registro de recebimento e indicadores (pago, pendente, atrasado, a receber nos próximos 30 dias).
- **Notificações** por usuário, geradas automaticamente em eventos-chave do contrato (enviado, assinado, ativo).
- **Web Push** (notificações do navegador, gratuito, via VAPID): aviso imediato de contrato próximo do vencimento e de contrato assinado pelo cliente, ativado pelo usuário em Configurações. Veja [`backend/README.md`](backend/README.md#web-push-notificações-do-navegador).
- **Histórico/auditoria**: toda ação relevante (criação, edição, remoção, mudança de status, pagamento) é registrada e listada.
- **Configurações/gestão do escritório**: dados do escritório editáveis (exclusivo de `ADMIN`) e perfil do usuário autenticado.

## Arquitetura

```text
Frontend (React + Vite)
        ↓  HTTP/JSON
API Fastify (Routes → Controllers)
        ↓
Services (regra de negócio)
        ↓
Prisma Client
        ↓
PostgreSQL
```

O backend segue uma arquitetura de **modular monolith**: cada domínio (`clients`, `contracts`, `contract-templates`, `documents`, `payments`, `notifications`, `audit`, `dashboard`, `offices`, `users`, `auth`) vive em `backend/src/modules/<módulo>/`, com seus próprios `*.routes.ts`, `*.controller.ts`, `*.service.ts` e `*.schemas.ts` — sem acoplamento direto entre módulos além do necessário (ex.: `contracts` referenciando `clients`/`contract-templates` por id). Código transversal (autenticação, tratamento de erros, paginação, serialização) fica em `backend/src/shared/`.

O sistema é **multi-tenant por escritório**: todo recurso de negócio guarda um `officeId`, e cada service filtra explicitamente por ele — dois escritórios nunca enxergam os dados um do outro.

## Stack

**Frontend**
- React 19 + TypeScript
- Vite 8
- React Router 7
- Tailwind CSS 4
- Lucide React (ícones)
- Recharts (gráficos do dashboard)

**Backend**
- Node.js 20+ / TypeScript
- Fastify 5
- PostgreSQL 16 + Prisma ORM 6
- Zod (validação de env vars e de requisições)
- `web-push` (Web Push com VAPID)
- JWT (`@fastify/jwt`) + bcryptjs
- Vitest (testes unitários e de integração)

**Infra**
- Docker (frontend e backend) + Docker Compose (backend + PostgreSQL)
- GitHub Actions (CI + deploy encadeado)
- Playwright (testes E2E, Chromium) · Sentry opcional (captura de erros)

## Segurança

Mecanismos existentes e verificáveis no código:

- **JWT** assina e valida a sessão (`@fastify/jwt`); toda rota protegida usa o preHandler `authenticate`.
- **RBAC** via `requireRole(...roles)`, aplicado nas rotas que exigem um papel específico (ver [seção CI/CD e RBAC](#rbac-por-papel) abaixo). A autorização é sempre verificada no backend — o frontend só usa o papel do usuário para ajustar a UI (ex.: `SettingsPage` só libera a edição do escritório para `ADMIN`), nunca como mecanismo de segurança.
- **bcryptjs** faz o hash de senhas; a senha nunca é armazenada ou logada em texto puro.
- **Validação com Zod** em body/params/querystring de toda rota que recebe entrada do cliente.
- **CORS** restrito à(s) origem(ns) configurada(s) em `CORS_ORIGIN`.
- **Isolamento multi-tenant por `officeId`**: toda query de leitura/escrita nos services filtra pelo escritório do usuário autenticado (`request.user.officeId`), nunca por um id vindo livremente do cliente.
- **Endpoints públicos de aceite** protegidos por token aleatório (SHA-256 no banco), expiração, uso único transacional e rate limit próprio; o job interno de renovação usa `CRON_SECRET`, não o JWT.
- **Web Push**: a chave privada VAPID existe só no backend; subscriptions pertencem ao usuário autenticado, o `endpoint` só é aceito de serviços de push conhecidos (anti-SSRF) e o conteúdo do push é apenas um resumo sem dados sensíveis.
- **Redação de dados sensíveis nos logs**: o logger (Pino) tem `redact` configurado para nunca logar o header `Authorization`, cookies, senha ou hash de senha (`backend/src/app.ts`).

Este projeto **não** alega conformidade com LGPD ou qualquer certificação de segurança — os itens acima são os mecanismos efetivamente implementados, não uma auditoria de compliance.

## Docker

**Frontend** (build multi-stage: Node para o build do Vite, Nginx para servir os estáticos):

```bash
docker build -t lexcontract-frontend .
# opcional: apontar para uma API diferente de http://localhost:3333 (valor embutido em build-time)
docker build --build-arg VITE_API_URL=https://api.seudominio.com -t lexcontract-frontend .

docker run -p 8080:80 lexcontract-frontend
# acesse http://localhost:8080
```

O Nginx serve os arquivos estáticos gerados em `dist/` e faz fallback de SPA (`nginx.conf`): qualquer rota do React Router (`/dashboard`, `/clientes`, `/contratos`, `/modelos`, etc.) acessada diretamente retorna `index.html` em vez de 404.

**Backend** (PostgreSQL + API, via Docker Compose):

```bash
cd backend
cp .env.example .env   # defina um JWT_SECRET forte
docker compose up
```

Isso sobe o container `postgres` (com healthcheck) e o container `backend`, que aguarda o banco ficar saudável, aplica as migrations (`prisma migrate deploy`) e inicia a API em `http://localhost:3333`. Veja `backend/README.md` para detalhes (variáveis de ambiente, seed, troubleshooting).

## Desenvolvimento local

**Frontend**

```bash
npm install
npm run dev
```

**Backend**

```bash
cd backend
npm install          # também roda `prisma generate` (postinstall)
npm run db:migrate    # cria/aplica migrations
npm run db:seed        # popula dados de desenvolvimento (3 usuários, um por papel)
npm run dev             # API com hot-reload em localhost:3333
```

Usuários de desenvolvimento criados pelo seed (senha `Senha@123` para todos):

| Papel     | E-mail                          |
| --------- | -------------------------------- |
| ADMIN     | `muryllo@escritorio.com.br`      |
| LAWYER    | `advogado@escritorio.com.br`     |
| ASSISTANT | `assistente@escritorio.com.br`   |

## CI/CD

O GitHub Actions (`.github/workflows/ci.yml`) roda em todo `push` para `main` e em toda `pull request`.

| Evento        | Jobs                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| Pull Request  | `frontend` · `backend` · `docker` · `e2e`                                |
| Push em `main`| `frontend` · `backend` · `docker` · `e2e` → **`deploy`**                 |

- **frontend**: `npm ci` → `npm run typecheck` → `npm run build` (nessa ordem).
- **backend**: `npm ci`, checagem de tipos (`npm run typecheck`), aplicação das migrations e execução dos testes (unitários + integração, com um PostgreSQL de serviço no próprio runner), e `npm run build`.
- **docker**: garante que as imagens Docker do frontend e do backend continuam buildáveis (`docker build`), rodando somente depois que `frontend` e `backend` passam.
- **e2e**: sobe um PostgreSQL **próprio** (`lexcontract_e2e`, separado do banco do job `backend`), aplica migrations + seed, inicia o backend em modo produção (`build` + `node dist/src/server.js`), builda o frontend e o serve com `vite preview`, e executa os 4 fluxos do Playwright (Chromium, com cache do navegador). Em caso de falha, publica o relatório HTML e os traces como artifact (nunca em execuções bem-sucedidas). Veja [Testes E2E](#testes-e2e).
- **deploy**: depende de `[frontend, backend, e2e, docker]` e só roda em `push` para `main` — **nunca em Pull Request**. Dispara os Deploy Hooks do Render (backend) e do Cloudflare Pages (frontend) com `curl`.

Além do CI, `.github/workflows/contract-renewal-alerts.yml` é um cron diário (e `workflow_dispatch`) que chama o endpoint interno de alertas de renovação — configuração em [`backend/README.md`](backend/README.md#cron-diário-alertas-de-renovação).

### Deploy automático (Deploy Hooks)

O deploy acontece **somente depois de todos os gates** (typecheck, build, testes de integração, E2E e build das imagens Docker):

```text
push em main → frontend + backend + e2e + docker → deploy (Render + Cloudflare Pages)
```

| Secret do GitHub (`Settings → Secrets and variables → Actions`) | Destino                      |
| ---------------------------------------------------------------- | ---------------------------- |
| `RENDER_DEPLOY_HOOK_URL`                                         | Backend (Render)             |
| `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`                               | Frontend (Cloudflare Pages)  |

- Os segredos nunca aparecem no código nem nos logs (a URL é passada por variável de ambiente e não é impressa).
- Se um secret não existir, o workflow emite um *warning* e **pula apenas aquele deploy** sem falhar o pipeline — dá para configurá-los depois. Se o hook existir mas responder erro, o job falha.
- **Desative o auto-deploy por push** no Render e no Cloudflare Pages. Caso contrário eles publicam a cada push em paralelo ao CI, e o encadeamento "só publica depois de passar nos gates" deixa de valer. Passo a passo no fim desta seção.
- O Cloudflare Pages precisa ter a variável `VITE_SENTRY_DSN` (opcional) disponível **no build**, pois ela é embutida no bundle e na CSP.

**Concorrência.** O `concurrency` do workflow cancela execuções antigas em PRs/branches, mas **não em `main`**: lá as execuções ficam em fila (uma rodando + a mais recente aguardando). Assim, um push novo nunca interrompe um `deploy` em andamento no meio (o que deixaria backend e frontend em versões diferentes), e dois deploys nunca se sobrepõem.

**Migrations em produção.** `prisma migrate deploy` roda **no startup do container do backend** (`backend/Dockerfile`: `npx prisma migrate deploy && node dist/src/server.js`). Não há etapa separada de migration. Consequências operacionais:

- migration e startup estão acoplados: **se a migration falhar, a API não sobe** (o Render mantém a versão anterior no ar até o novo deploy ficar saudável, mas o deploy falha);
- migrations destrutivas ou longas atrasam o startup — prefira migrations aditivas e compatíveis com a versão anterior do código;
- evite **deploys concorrentes** (dois containers rodando `migrate deploy` ao mesmo tempo): o `concurrency` acima já impede que o CI faça isso, mas evite também disparar deploys manuais em paralelo.

**Passo a passo manual (uma única vez)**

1. Render → serviço do backend → *Settings → Deploy Hook*: crie o hook e salve a URL no secret `RENDER_DEPLOY_HOOK_URL`.
2. Cloudflare Pages → projeto do frontend → *Settings → Builds & deployments → Deploy hooks*: crie o hook e salve a URL no secret `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`.
3. Render → *Settings → Build & Deploy → Auto-Deploy*: **Off**. O deploy passa a ser feito só pelo Deploy Hook disparado pelo GitHub Actions.
4. Cloudflare Pages → *Settings → Builds → Branch control*: desative os deploys automáticos da branch de produção, mantendo o Deploy Hook (o nome exato da opção pode variar conforme a versão do painel).

### Health checks

Os endpoints já existem e não foram alterados: `GET /health` e `GET /health/db`.

- **Health Check do Render**: use **`/health`**. Ele não depende do banco, então uma oscilação do Neon não reinicia a API.
- **Monitoramento externo** (uptime monitor, alertas): use `/health/db` se quiser acompanhar também a conectividade com o banco.
  > O Neon pode ter *cold start* / latência transitória e o `/health/db` pode responder `503` nesses momentos. **Não use `/health/db` como Health Check do Render**: isso pode provocar reinícios indevidos do serviço.

### RBAC por papel

`requireRole(...)` (já existente em `backend/src/shared/auth/require-role.ts`) restringe, além da rota administrativa pré-existente:

| Rota                              | Papéis permitidos     | Motivo                                                              |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `PATCH /offices/me`                 | `ADMIN`                 | Dados administrativos do escritório (regra pré-existente, preservada) |
| `POST/PATCH/DELETE /contract-templates` | `ADMIN`, `LAWYER` | Definir o texto legal de um modelo é um ato jurídico                  |
| `POST /contracts`, `PATCH /contracts/:id`, `PATCH /contracts/:id/status` | `ADMIN`, `LAWYER` | Criar/editar um contrato e movê-lo entre status (enviar, assinar, ativar) é o núcleo do trabalho jurídico |

Leitura (`GET`) desses recursos, e todos os demais módulos (clientes, documentos, pagamentos, notificações, dashboard, auditoria), permanecem acessíveis a qualquer usuário autenticado — são operações auxiliares/operacionais que já faziam parte do fluxo normal de um `ASSISTANT`.

## Testes E2E

Quatro fluxos, em `e2e/`, com Playwright (somente Chromium):

1. **Login** — autenticação pela interface até o dashboard (respeita a troca obrigatória de senha: os usuários do seed não a exigem).
2. **Criar contrato** — wizard completo (cliente → modelo → informações → revisão) até o contrato criado como rascunho.
3. **Enviar contrato** — como `LAWYER`, rascunho → *Enviado*, validado também após recarregar a página.
4. **Registrar pagamento** — parcela pendente → paga, validado também após recarregar.

Os testes são independentes e idempotentes: cada um cria seus próprios dados (cliente/modelo/contrato com nome único por execução, via API quando é só pré-requisito) e não depende da ordem. Os fluxos 2–4 abrem a sessão com um JWT obtido pela API; só o fluxo 1 faz login pela tela.

**Requisitos locais**: Node 20+, PostgreSQL 16 (ex.: `backend/docker-compose.yml`) e `npx playwright install chromium`.

```bash
# 1. PostgreSQL de teste (isolado do banco de desenvolvimento)
docker run -d --name lexcontract-e2e-db -p 5433:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lexcontract_e2e \
  postgres:16-alpine

# 2. Backend: migrations + seed + build + start (porta 3333)
cd backend
npm ci
export DATABASE_URL='postgresql://postgres:postgres@localhost:5433/lexcontract_e2e?schema=public'
export DIRECT_URL="$DATABASE_URL"
export JWT_SECRET='e2e-only-secret-not-used-anywhere-else-0123456789'
export CORS_ORIGIN='http://localhost:4173'
export LOGIN_RATE_LIMIT_MAX=1000   # os testes fazem vários logins do mesmo IP
npm run db:migrate:deploy
npm run db:seed
npm run build && npm start &       # ou `npm run dev` em outro terminal
cd ..

# 3. Frontend: build apontando para o backend + preview (porta 4173)
npm ci
VITE_API_URL=http://localhost:3333 npm run build
npm run preview -- --port 4173 --strictPort &

# 4. Chromium + testes
npx playwright install chromium
npm run test:e2e
```

URLs diferentes das padrão: `E2E_BASE_URL` (frontend, padrão `http://localhost:4173`) e `E2E_API_URL` (backend, padrão `http://localhost:3333`).

Depuração:

```bash
npx playwright test --ui              # interface interativa
npx playwright test --debug           # inspector passo a passo
npx playwright test --headed          # vê o navegador
npx playwright show-report            # relatório HTML da última execução
```

> **Limitação:** os testes E2E **não validam a CSP** de `public/_headers`, pois essa política é aplicada pelo Cloudflare Pages e o `vite preview` local não reproduz esse comportamento de infraestrutura. Não há (e não deve haver) um teste de CSP no Playwright.

## Observabilidade (Sentry)

Captura de **erros** no frontend e no backend, 100% opcional. Sem DSN o Sentry **não é inicializado** e nada é enviado: o desenvolvimento, os testes e o CI funcionam sem configuração.

| Variável           | Onde                        | Descrição                                                           |
| ------------------- | ---------------------------- | -------------------------------------------------------------------- |
| `SENTRY_DSN`        | Backend (Render)             | DSN do projeto *LexContract Backend*. Ausente = desativado          |
| `SENTRY_ENVIRONMENT`| Backend (Render)             | Opcional; assume `NODE_ENV` quando não definida                     |
| `VITE_SENTRY_DSN`   | Frontend (build, Cloudflare) | DSN do projeto *LexContract Frontend*. Ausente = desativado         |

- Sem Session Replay, sem profiling e sem tracing (`tracesSampleRate: 0`). Upload de source maps **não** é feito nesta etapa.
- **Backend**: inicializado uma única vez em `backend/src/server.ts` (nunca em `buildApp()`, para não interferir nos testes com `app.inject()`). O error handler global reporta **apenas erros inesperados que viram 500**; `AppError` e 4xx não são enviados. A resposta HTTP e o log continuam idênticos.
- **Frontend**: inicializado em `src/main.tsx`. Um *Error Boundary* global (`GlobalErrorBoundary`) mostra uma tela de erro amigável, com botão para recarregar, em vez de tela branca.
- **Privacidade (LGPD)**: sem PII padrão, sem usuário/e-mail/nome, sem cookies, sem `Authorization`/headers e sem body de requisição. (No SDK v11 a opção `sendDefaultPii` foi substituída por `dataCollection`, configurada aqui com tudo desligado.)
- **Tokens de assinatura nunca chegam ao Sentry**: `/public/signatures/<token>` (backend, via `redactSignatureTokenInUrl`) e `/assinar/<token>` (frontend, `src/lib/redact-signature-token.ts`) viram `[REDACTED]` em URLs de evento, breadcrumbs, contextos e nome de transação (`beforeSend`/`beforeBreadcrumb`).
- **CSP**: a origem do DSN do frontend é acrescentada **somente** ao `connect-src` e **somente** quando `VITE_SENTRY_DSN` está definido (plugin `securityHeadersApiOrigin`, mesmo mecanismo da origem da API). As demais diretivas não mudam.

## Estrutura do projeto

```text
law-contract-management/
├── .github/workflows/ci.yml     # pipeline de CI + deploy
├── e2e/                          # testes E2E (Playwright)
├── playwright.config.ts
├── Dockerfile                    # imagem de produção do frontend (Node build → Nginx)
├── nginx.conf                     # fallback de SPA para o React Router
├── public/sw.js                    # Service Worker do Web Push
├── src/                             # frontend (React + Vite)
│   ├── components/                    # ProtectedRoute, StatusBadge...
│   ├── contexts/AuthContext.tsx         # sessão do usuário
│   ├── layouts/AppLayout.tsx              # shell com sidebar/navegação
│   ├── pages/                               # uma página por rota (Dashboard, Clientes, Contratos...)
│   ├── services/                              # chamadas de API por domínio
│   └── lib/api-client.ts                        # cliente HTTP central
└── backend/                        # API Fastify
    ├── Dockerfile                    # imagem de produção do backend
    ├── docker-compose.yml             # Postgres + backend
    ├── prisma/schema.prisma            # modelo de dados
    └── src/
        ├── modules/                      # um módulo por domínio (routes/controller/service/schemas)
        └── shared/                          # auth, erros, http, utils transversais
```

## Case Study — LexContract

### Problema

Pequenos escritórios de advocacia frequentemente não têm um sistema dedicado para acompanhar o ciclo de vida de um contrato de prestação de serviços: da negociação inicial ao encerramento, passando por geração do texto, envio, assinatura, cobrança de honorários e guarda de documentos. Sem isso, informação fica espalhada entre e-mail, WhatsApp, planilhas e pastas físicas — dificultando auditoria, cobrança e continuidade quando mais de uma pessoa (advogado, sócio, assistente) precisa acompanhar o mesmo caso.

### Solução

O LexContract organiza esse fluxo em torno de um único domínio central — o **Contrato** — que referencia um **Cliente** e um **Modelo**, é responsabilidade de um **usuário** (o advogado responsável) e acumula, ao longo do tempo: **versões** do texto (uma nova versão a cada edição que muda conteúdo, enquanto em rascunho), **documentos** anexados, **pagamentos** (parcelas com vencimento e status) e entradas de **auditoria**. Cada mudança de status relevante (envio, assinatura, ativação) dispara uma **notificação** para o responsável. Todo esse grafo de dados é isolado por **escritório** (`officeId`), permitindo que o mesmo sistema atenda múltiplos tenants sem risco de vazamento de dados entre eles.

### Decisões técnicas

- **Modular monolith em vez de microserviços**: para o volume e a equipe de um produto neste estágio, múltiplos serviços trariam custo operacional (deploy, observabilidade, comunicação de rede) sem benefício real. Os módulos já são fisicamente separados em pastas com fronteiras claras, o que barateia uma futura extração caso o produto cresça o suficiente para justificar.
- **Fastify + Prisma + PostgreSQL**: Fastify por performance e um sistema de plugins/hooks direto (`preHandler` é a base do RBAC deste projeto); Prisma por type-safety ponta a ponta entre schema e código; PostgreSQL por ser a escolha padrão, madura e relacional para dados fortemente relacionados como este domínio (cliente → contrato → versões/documentos/pagamentos).
- **JWT + bcryptjs**: autenticação stateless (sem sessão em banco/Redis), simples de escalar horizontalmente; bcryptjs evita dependência de compilação nativa em diferentes ambientes de build/deploy.
- **RBAC com `requireRole()` nos `preHandler`s das rotas**, em vez de uma tabela de permissões ou camada de ACL: com apenas três papéis fixos (`ADMIN`, `LAWYER`, `ASSISTANT`) e regras estáveis por domínio, uma tabela de permissões dinâmica adicionaria complexidade sem necessidade real — o princípio do menor privilégio é aplicado diretamente onde o Fastify já intercepta a requisição.
- **Docker (multi-stage) para as duas aplicações**: o frontend usa Node só para o build do Vite e entrega os estáticos via Nginx (imagem final enxuta, sem runtime Node em produção); o backend usa um estágio de dependências de produção separado do estágio de build, para não carregar `devDependencies` na imagem final.
- **CI no GitHub Actions com quatro frentes (frontend, backend, docker, e2e) + deploy**: cada uma falha independentemente e rápido, e o job de Docker só roda depois que o build/typecheck/testes passam — evita gastar tempo de CI construindo uma imagem de um código já quebrado. O `deploy` só roda após todas e apenas em `main`.
- **React + Vite no frontend**: mantidos como já estavam (o objetivo desta etapa foi evoluir o backend/infra, não o frontend) — SPA client-side com React Router cobre bem as necessidades de uma aplicação interna de gestão.

### Segurança e autorização

Autenticação (provar quem é o usuário, via JWT) e autorização (decidir o que esse usuário pode fazer, via `requireRole`) são tratadas como responsabilidades separadas e sequenciais no `preHandler` de cada rota: primeiro `authenticate`, depois `requireRole(...)` quando a rota exige um papel específico, depois `validate(...)` do corpo/parâmetros. O backend é a única fonte de verdade para permissões — o frontend pode (e em um caso já faz, em `SettingsPage`) esconder um botão para melhorar a experiência do usuário, mas isso nunca substitui a checagem real no servidor. Um usuário mal-intencionado que force uma chamada direta à API contornando a UI ainda recebe `403 Forbidden` do backend.

### Infraestrutura

- **Docker**: `backend/Dockerfile` (multi-stage: dependências → build → dependências de produção → runtime) e `Dockerfile` na raiz para o frontend (multi-stage: build com Node/Vite → Nginx).
- **Docker Compose**: `backend/docker-compose.yml` sobe PostgreSQL com healthcheck e o backend, aplicando migrations automaticamente antes de iniciar.
- **GitHub Actions**: pipeline única (`ci.yml`) com jobs `frontend`, `backend` (incluindo um serviço PostgreSQL efêmero para os testes de integração), `docker`, `e2e` (PostgreSQL próprio + Playwright) e `deploy` (Deploy Hooks, só em `main`).

### Aprendizados

- Organizar o backend em módulos por domínio (em vez de por camada técnica) manteve cada funcionalidade fácil de localizar e evoluir isoladamente, mesmo com dez módulos diferentes.
- Persistência relacional com Prisma tornou explícitas, via `@@index` e `@@unique`, regras de negócio que de outra forma ficariam só na cabeça de quem escreveu o código (ex.: um CPF/CNPJ não pode se repetir *dentro do mesmo escritório*, mas pode entre escritórios diferentes).
- Testes de integração via `app.inject()` (sem porta TCP real) permitem cobrir o comportamento real de HTTP + autenticação + autorização + banco sem a lentidão/flakiness de subir um servidor de verdade — o novo `rbac.test.ts` desta etapa se apoiou diretamente nesse padrão já estabelecido.
- Containerizar o frontend como estáticos servidos por Nginx (e não por um servidor Node) evidenciou uma pegada de produção bem menor e mais simples de operar do que manter um processo Node só para servir arquivos que não mudam depois do build.
- Um pipeline de CI com jobs independentes (frontend/backend/docker) dá sinal rápido e específico de onde algo quebrou, sem exigir uma leitura longa de log misto.
