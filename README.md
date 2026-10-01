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
- JWT (`@fastify/jwt`) + bcryptjs
- Vitest (testes unitários e de integração)

**Infra**
- Docker (frontend e backend) + Docker Compose (backend + PostgreSQL)
- GitHub Actions (CI)

## Segurança

Mecanismos existentes e verificáveis no código:

- **JWT** assina e valida a sessão (`@fastify/jwt`); toda rota protegida usa o preHandler `authenticate`.
- **RBAC** via `requireRole(...roles)`, aplicado nas rotas que exigem um papel específico (ver [seção CI/CD e RBAC](#rbac-por-papel) abaixo). A autorização é sempre verificada no backend — o frontend só usa o papel do usuário para ajustar a UI (ex.: `SettingsPage` só libera a edição do escritório para `ADMIN`), nunca como mecanismo de segurança.
- **bcryptjs** faz o hash de senhas; a senha nunca é armazenada ou logada em texto puro.
- **Validação com Zod** em body/params/querystring de toda rota que recebe entrada do cliente.
- **CORS** restrito à(s) origem(ns) configurada(s) em `CORS_ORIGIN`.
- **Isolamento multi-tenant por `officeId`**: toda query de leitura/escrita nos services filtra pelo escritório do usuário autenticado (`request.user.officeId`), nunca por um id vindo livremente do cliente.
- **Endpoints públicos de aceite** protegidos por token aleatório (SHA-256 no banco), expiração, uso único transacional e rate limit próprio; o job interno de renovação usa `CRON_SECRET`, não o JWT.
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

O GitHub Actions (`.github/workflows/ci.yml`) roda em todo `push` para `main` e em toda `pull request`, com três jobs:

- **frontend**: `npm ci` + `npm run build`.
- **backend**: `npm ci`, checagem de tipos (`npm run typecheck`), aplicação das migrations e execução dos testes (unitários + integração, com um PostgreSQL de serviço no próprio runner), e `npm run build`.
- **docker**: garante que as imagens Docker do frontend e do backend continuam buildáveis (`docker build`), rodando somente depois que os dois jobs acima passam.

Além do CI, `.github/workflows/contract-renewal-alerts.yml` é um cron diário (e `workflow_dispatch`) que chama o endpoint interno de alertas de renovação — configuração em [`backend/README.md`](backend/README.md#cron-diário-alertas-de-renovação).

Não há deploy automático nesta etapa — o CI valida o código, não o publica em nenhum ambiente.

### RBAC por papel

`requireRole(...)` (já existente em `backend/src/shared/auth/require-role.ts`) restringe, além da rota administrativa pré-existente:

| Rota                              | Papéis permitidos     | Motivo                                                              |
| ---------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `PATCH /offices/me`                 | `ADMIN`                 | Dados administrativos do escritório (regra pré-existente, preservada) |
| `POST/PATCH/DELETE /contract-templates` | `ADMIN`, `LAWYER` | Definir o texto legal de um modelo é um ato jurídico                  |
| `POST /contracts`, `PATCH /contracts/:id`, `PATCH /contracts/:id/status` | `ADMIN`, `LAWYER` | Criar/editar um contrato e movê-lo entre status (enviar, assinar, ativar) é o núcleo do trabalho jurídico |

Leitura (`GET`) desses recursos, e todos os demais módulos (clientes, documentos, pagamentos, notificações, dashboard, auditoria), permanecem acessíveis a qualquer usuário autenticado — são operações auxiliares/operacionais que já faziam parte do fluxo normal de um `ASSISTANT`.

## Estrutura do projeto

```text
law-contract-management/
├── .github/workflows/ci.yml     # pipeline de CI
├── Dockerfile                    # imagem de produção do frontend (Node build → Nginx)
├── nginx.conf                     # fallback de SPA para o React Router
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
- **CI no GitHub Actions com três frentes (frontend, backend, docker)**: cada uma falha independentemente e rápido, e o job de Docker só roda depois que o build/typecheck/testes passam — evita gastar tempo de CI construindo uma imagem de um código já quebrado.
- **React + Vite no frontend**: mantidos como já estavam (o objetivo desta etapa foi evoluir o backend/infra, não o frontend) — SPA client-side com React Router cobre bem as necessidades de uma aplicação interna de gestão.

### Segurança e autorização

Autenticação (provar quem é o usuário, via JWT) e autorização (decidir o que esse usuário pode fazer, via `requireRole`) são tratadas como responsabilidades separadas e sequenciais no `preHandler` de cada rota: primeiro `authenticate`, depois `requireRole(...)` quando a rota exige um papel específico, depois `validate(...)` do corpo/parâmetros. O backend é a única fonte de verdade para permissões — o frontend pode (e em um caso já faz, em `SettingsPage`) esconder um botão para melhorar a experiência do usuário, mas isso nunca substitui a checagem real no servidor. Um usuário mal-intencionado que force uma chamada direta à API contornando a UI ainda recebe `403 Forbidden` do backend.

### Infraestrutura

- **Docker**: `backend/Dockerfile` (multi-stage: dependências → build → dependências de produção → runtime) e `Dockerfile` na raiz para o frontend (multi-stage: build com Node/Vite → Nginx).
- **Docker Compose**: `backend/docker-compose.yml` sobe PostgreSQL com healthcheck e o backend, aplicando migrations automaticamente antes de iniciar.
- **GitHub Actions**: pipeline única (`ci.yml`) com jobs `frontend`, `backend` (incluindo um serviço PostgreSQL efêmero para os testes de integração) e `docker`.

### Aprendizados

- Organizar o backend em módulos por domínio (em vez de por camada técnica) manteve cada funcionalidade fácil de localizar e evoluir isoladamente, mesmo com dez módulos diferentes.
- Persistência relacional com Prisma tornou explícitas, via `@@index` e `@@unique`, regras de negócio que de outra forma ficariam só na cabeça de quem escreveu o código (ex.: um CPF/CNPJ não pode se repetir *dentro do mesmo escritório*, mas pode entre escritórios diferentes).
- Testes de integração via `app.inject()` (sem porta TCP real) permitem cobrir o comportamento real de HTTP + autenticação + autorização + banco sem a lentidão/flakiness de subir um servidor de verdade — o novo `rbac.test.ts` desta etapa se apoiou diretamente nesse padrão já estabelecido.
- Containerizar o frontend como estáticos servidos por Nginx (e não por um servidor Node) evidenciou uma pegada de produção bem menor e mais simples de operar do que manter um processo Node só para servir arquivos que não mudam depois do build.
- Um pipeline de CI com jobs independentes (frontend/backend/docker) dá sinal rápido e específico de onde algo quebrou, sem exigir uma leitura longa de log misto.
