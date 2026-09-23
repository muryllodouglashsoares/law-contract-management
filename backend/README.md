# LexContract — Backend

Backend do LexContract, SaaS de gestão de contratos de prestação de serviços
jurídicos para advogados autônomos e pequenos escritórios de advocacia.

Esta é a **fundação inicial** do backend: infraestrutura, autenticação,
usuários e RBAC. Os módulos de domínio (Clientes, Contratos, Modelos,
Documentos, Pagamentos, Notificações, Auditoria, Dashboard) ainda **não**
foram implementados — veja [Próximos módulos](#próximos-módulos).

O frontend (`../src`) continua usando `src/data/mock.ts` normalmente nesta
etapa. A integração real frontend → backend é um passo futuro.

## Índice

- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Rodando com Docker (recomendado)](#rodando-com-docker-recomendado)
- [Rodando localmente sem Docker](#rodando-localmente-sem-docker)
- [Migrations](#migrations)
- [Seed](#seed)
- [Testes](#testes)
- [Scripts disponíveis](#scripts-disponíveis)
- [Endpoints existentes](#endpoints-existentes)
- [Próximos módulos](#próximos-módulos)
- [Decisões arquiteturais](#decisões-arquiteturais)
- [Troubleshooting](#troubleshooting)

## Stack

- **Node.js** 20+ / **TypeScript**
- **Fastify** 5 — servidor HTTP
- **PostgreSQL** 16 + **Prisma ORM** 6 — banco de dados
- **Zod** 4 — validação de env vars e de requisições HTTP
- **JWT** (`@fastify/jwt`) — autenticação
- **bcryptjs** — hashing de senha
- **Vitest** — testes unitários e de integração
- **Docker / Docker Compose** — ambiente local

Arquitetura: **modular monolith** (nada de microserviços, filas, cache,
GraphQL ou NoSQL nesta etapa — ver [Regras de arquitetura originais]).

## Arquitetura

```text
HTTP
 ↓
Routes            (src/modules/*/*.routes.ts)      — registro de rotas + validação
 ↓
Controllers        (src/modules/*/*.controller.ts)  — parsing de request/response
 ↓
Services            (src/modules/*/*.service.ts)     — regra de negócio
 ↓
Prisma Client       (src/shared/database/prisma.ts)  — acesso a dados
 ↓
PostgreSQL
```

```text
backend/
├── src/
│   ├── config/env.ts            # validação das env vars com Zod (fail-fast)
│   ├── modules/
│   │   ├── auth/                # login, /auth/me
│   │   └── users/                # /users/me (GET, PATCH)
│   ├── shared/
│   │   ├── auth/                 # authenticate(), requireRole(), hash de senha
│   │   ├── database/             # PrismaClient singleton
│   │   ├── errors/               # AppError e subclasses
│   │   ├── http/                 # error handler central + validate() (Zod)
│   │   ├── types/                # augmentação de tipos (JWT payload)
│   │   └── utils/                # serialização segura de User
│   ├── app.ts                    # monta o Fastify (sem dar listen — usado nos testes)
│   └── server.ts                 # ponto de entrada real (dá listen)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/                     # não tocam banco (Prisma mockado via DI)
│   └── integration/              # sobem o app via app.inject(), usam banco de TESTE
├── Dockerfile
└── docker-compose.yml
```

## Instalação

```bash
cd backend
cp .env.example .env
# edite .env e defina um JWT_SECRET forte (ver seção Variáveis de ambiente)
```

A partir daqui, use **Docker** (mais simples) ou rode **localmente** — ambos
documentados abaixo.

## Variáveis de ambiente

Veja `.env.example` para a lista completa e comentada. Resumo:

| Variável         | Obrigatória | Descrição                                             |
| ---------------- | :---------: | ------------------------------------------------------ |
| `NODE_ENV`       | não | `development` \| `test` \| `production` (padrão: `development`) |
| `PORT`           | não | Porta HTTP (padrão: `3333`)                            |
| `DATABASE_URL`   | **sim** | Connection string do PostgreSQL                    |
| `JWT_SECRET`     | **sim** | Segredo para assinar os JWTs (mín. 16 caracteres)   |
| `JWT_EXPIRES_IN` | não | Validade do token (padrão: `1d`)                        |
| `CORS_ORIGIN`    | não | Origem do frontend permitida via CORS                   |
| `LOG_LEVEL`      | não | Nível de log do Pino (padrão: `info`)                    |

Se `DATABASE_URL` ou `JWT_SECRET` estiverem ausentes ou inválidas, a
aplicação **falha imediatamente ao iniciar**, com uma mensagem clara
apontando o campo problemático (`src/config/env.ts`).

## Rodando com Docker (recomendado)

```bash
docker compose up
```

Isso sobe o PostgreSQL, aplica as migrations pendentes (`prisma migrate
deploy`) e inicia a API em `http://localhost:3333`, tudo em um único
comando. O banco fica persistido no volume `lexcontract_postgres_data`.

Para rodar o seed de desenvolvimento dentro do container:

```bash
docker compose exec backend npm run db:seed
```

Para derrubar o ambiente (mantendo os dados):

```bash
docker compose down
```

Para apagar também os dados do banco:

```bash
docker compose down -v
```

## Rodando localmente sem Docker

Pré-requisito: um PostgreSQL acessível (local ou remoto) e sua
`DATABASE_URL` configurada no `.env`.

```bash
npm install          # também roda `prisma generate` (postinstall)
npm run db:migrate    # aplica as migrations (cria o banco/tabelas)
npm run db:seed        # popula dados de desenvolvimento
npm run dev             # inicia a API com hot-reload em localhost:3333
```

## Migrations

```bash
npm run db:migrate          # cria/aplica migrations em desenvolvimento (interativo)
npm run db:migrate:deploy   # aplica migrations existentes sem gerar novas (produção/CI)
npm run db:generate          # regenera o Prisma Client a partir do schema
```

A migration inicial (`prisma/migrations/`) cria as tabelas `offices` e
`users`. Ela é gerada automaticamente na primeira execução de `npm run
db:migrate` — veja a nota em [Troubleshooting](#troubleshooting) sobre por
que ela não foi gerada previamente neste ambiente de desenvolvimento.

## Seed

```bash
npm run db:seed
```

Cria 1 escritório e 3 usuários de desenvolvimento:

| Papel       | E-mail                            | Senha       |
| ----------- | ---------------------------------- | ----------- |
| ADMIN       | `muryllo@escritorio.com.br`        | `Senha@123` |
| LAWYER      | `advogado@escritorio.com.br`       | `Senha@123` |
| ASSISTANT   | `assistente@escritorio.com.br`     | `Senha@123` |

⚠️ **Credenciais apenas para desenvolvimento.** Nunca as utilize em
produção — troque o seed ou crie usuários reais via um fluxo de
administração (a ser implementado em uma etapa futura).

## Testes

```bash
npm test              # roda tudo (unit + integration)
npm run test:watch    # modo watch
npm run test:coverage # com relatório de cobertura
```

- **Unitários** (`tests/unit`): não tocam o banco — os services recebem um
  Prisma Client "fake" por injeção de dependência. Cobrem hashing de senha,
  RBAC (`requireRole`), validação Zod (`validate`) e a lógica de negócio de
  `AuthService`/`UserService`.
- **Integração** (`tests/integration`): sobem o Fastify via `app.inject()`
  (sem porta TCP real) e usam um **banco de teste dedicado** — nunca o de
  desenvolvimento/produção. Antes da primeira execução, crie e migre esse
  banco:

  ```bash
  # ajuste o nome/credenciais conforme seu Postgres local
  createdb lexcontract_test
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lexcontract_test?schema=public" \
    npx prisma migrate deploy
  ```

  Por padrão, os testes apontam para
  `postgresql://postgres:postgres@localhost:5432/lexcontract_test?schema=public`
  (configurável via `DATABASE_URL` antes de rodar `npm test` — ver
  `vitest.config.ts`).

## Scripts disponíveis

| Script                  | Descrição                                          |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`             | inicia a API com hot-reload                         |
| `npm run build`            | compila TypeScript para `dist/`                      |
| `npm start`                 | roda a build compilada (`dist/server.js`)             |
| `npm test`                   | roda todos os testes (Vitest)                          |
| `npm run test:watch`          | testes em modo watch                                    |
| `npm run test:coverage`        | testes com cobertura                                     |
| `npm run lint` / `typecheck`     | checagem de tipos TypeScript (`tsc --noEmit`)              |
| `npm run db:generate`             | gera o Prisma Client                                          |
| `npm run db:migrate`               | cria/aplica migrations (dev)                                    |
| `npm run db:migrate:deploy`         | aplica migrations existentes (prod/CI)                            |
| `npm run db:seed`                     | popula dados de desenvolvimento                                     |
| `npm run db:studio`                     | abre o Prisma Studio (GUI do banco)                                   |

## Endpoints existentes

Todas as respostas de erro seguem o formato:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
```

| Método | Rota          | Autenticação | Descrição                                 |
| ------ | ------------- | :----------: | ------------------------------------------ |
| GET    | `/health`      | não          | `{ "status": "ok" }`                        |
| GET    | `/health/db`   | não          | Verifica também a conectividade com o banco  |
| POST   | `/auth/login`  | não          | `{ email, password }` → `{ accessToken, user }` |
| GET    | `/auth/me`     | sim (JWT)    | Dados do usuário autenticado                     |
| GET    | `/users/me`    | sim (JWT)    | Dados do usuário autenticado                     |
| PATCH  | `/users/me`    | sim (JWT)    | Atualiza `name` do usuário autenticado           |

Autenticação: header `Authorization: Bearer <accessToken>`.

`requireRole('ADMIN', 'LAWYER', ...)` (em `src/shared/auth/require-role.ts`)
já está pronto para proteger rotas futuras por papel — nenhuma rota atual
exige um papel específico além de estar autenticado.

## Próximos módulos

Não implementados nesta etapa, mas a arquitetura (multi-tenant via
`officeId`, padrão de módulo, error handling, validação, RBAC) já está
preparada para recebê-los:

```text
offices (administração)   clients            contract-templates
contracts                  contract-versions   documents
payments                    notifications        audit
dashboard
```

E, mais adiante: assinatura digital, relatórios, integrações, assistência
com IA.

## Decisões arquiteturais

- **Sem camada de "repository" separada.** Services acessam o Prisma Client
  diretamente (`Routes → Controllers → Services → Prisma → PostgreSQL`).
  Para o volume atual de queries (simples, uma por método), uma camada de
  repository adicionaria indireção sem benefício real. Se/quando queries
  complexas se repetirem entre services, extraímos repositories específicos
  naquele momento.
- **`prisma` como dependency (não devDependency).** Necessário para que
  `docker compose up` consiga rodar `prisma migrate deploy` dentro do
  container de produção antes de iniciar o servidor, sem depender de uma
  imagem/etapa Docker separada só para migrations.
- **Prisma 6.19 (não 7.x).** Este projeto foi construído durante a janela
  de lançamento do Prisma ORM 7, que introduziu uma reformulação
  significativa (novo arquivo `prisma.config.ts` obrigatório, generator
  padrão diferente, remoção de `url` em `datasource`) e, na versão 7.10, um
  bug conhecido e ainda aberto no fluxo de download dos engines do CLI. A
  6.19.3 é a última da série 6, estável, amplamente testada em produção e
  com o fluxo clássico (`datasource { url = env("DATABASE_URL") }`,
  `prisma migrate dev`) que a maioria dos guias e integrações já assume.
- **bcryptjs em vez de bcrypt/argon2.** Implementação 100% JavaScript, sem
  compilação nativa — elimina uma classe inteira de problemas de build em
  diferentes ambientes de deploy (serverless, Alpine, CI) em troca de um
  custo de CPU marginal, aceitável para um SaaS deste porte.
- **CommonJS em vez de ESM.** Evita a exigência de extensões `.js` em
  imports relativos de TypeScript (`import '../foo.js'` para um arquivo
  `foo.ts`), reduzindo atrito de desenvolvimento sem nenhuma perda prática
  para uma API Node.js pura (sem necessidade de interop com pacotes
  ESM-only nesta etapa).
- **`GET /auth/me` e `GET /users/me` coexistem.** São intencionalmente
  equivalentes nesta etapa (o primeiro fica no módulo de auth por
  completude do fluxo de login; o segundo é o endpoint "oficial" de perfil,
  onde o `PATCH` também vive). Mantidos ambos para não quebrar nenhuma
  expectativa de nomenclatura de rota alinhada ao spec original.
- **Campos adicionais vistos no frontend (`SettingsPage.tsx`) não foram
  adicionados a `Office`/`User` nesta etapa** — especificamente OAB
  (registro do advogado), CNPJ formatado, endereço completo do escritório,
  especialidades e telefone do usuário. O spec desta etapa lista
  explicitamente os campos mínimos de `Office` e `User`, e pede para não
  adicionar campos por especulação. Como o frontend claramente vai
  precisar deles, documento a necessidade aqui para que sejam adicionados
  de forma deliberada quando o módulo de perfil/escritório for
  implementado (provavelmente junto do módulo `offices` futuro), em vez de
  adicionados agora sem uso real.

## Troubleshooting

**`npm install` falha no passo `postinstall` (`prisma generate`) com erro de
rede/checksum.** O Prisma precisa baixar os binários da engine de
`binaries.prisma.sh` na primeira instalação. Se sua rede/proxy/firewall
bloquear esse domínio, o `npm install` falha. Libere o acesso a
`binaries.prisma.sh` (ou configure `PRISMA_ENGINES_MIRROR` para um mirror
interno) e rode `npm install` novamente — isso não é um problema do código,
é uma dependência externa do próprio Prisma CLI.

> Nota de desenvolvimento: o ambiente onde este backend foi construído tem
> acesso de rede restrito a poucos domínios (registries de pacotes, GitHub,
> etc.) e **não** inclui `binaries.prisma.sh`. Por isso, `prisma generate`,
> `prisma migrate dev` e os testes de integração não puderam ser executados
> até o final durante o desenvolvimento — apenas os testes unitários (que
> não dependem do Prisma Client gerado) foram validados localmente. O
> schema, os services e as rotas foram revisados cuidadosamente contra a
> documentação oficial do Prisma 6, mas rode `npm run db:migrate` e `npm
> test` no seu ambiente (com acesso normal à internet) para validar a
> ponta a ponta antes de considerar esta etapa 100% concluída.

**Erro `DATABASE_URL inválida` ou `JWT_SECRET é obrigatória` ao iniciar.**
Confira se copiou `.env.example` para `.env` e preencheu os valores — a
aplicação recusa iniciar com configuração incompleta, de propósito.

**`docker compose up` não sobe o backend.** Confirme que `JWT_SECRET` está
definida no seu `.env` na raiz de `backend/` — o `docker-compose.yml` exige
essa variável explicitamente e recusa subir sem ela.
