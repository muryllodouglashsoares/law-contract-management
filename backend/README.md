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
- [Storage de documentos](#storage-de-documentos)
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
| `LOGIN_RATE_LIMIT_MAX` | não | Máximo de tentativas de `POST /auth/login` por IP na janela (padrão: `5`) |
| `LOGIN_RATE_LIMIT_WINDOW` | não | Janela do limite acima, ex.: `1 minute`, `30 seconds` ou ms (padrão: `1 minute`) |
| `STORAGE_DRIVER` | não | `local` (padrão) \| `neon-s3` — ver [Storage de documentos](#storage-de-documentos) |
| `UPLOADS_DIR`    | não | Pasta do driver `local` (padrão: `./uploads`)           |
| `MAX_UPLOAD_SIZE_BYTES` | não | Limite de upload por arquivo (padrão: 10 MB)     |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **sim, se** `neon-s3` | Credenciais do bucket (somente no backend) |
| `S3_FORCE_PATH_STYLE` | não | Path-style nas URLs S3 (padrão: `true`)             |

### Rate limit do login

`POST /auth/login` é limitado por IP (`@fastify/rate-limit`, `global: false` — nenhuma
outra rota é afetada). Ao exceder, a API responde `429` com `Retry-After` (segundos) e
`{ "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Muitas tentativas de login. Tente novamente em instantes." } }`.
O Fastify roda com `trustProxy: true` (API atrás do proxy do Render) para que o IP contado
seja o do cliente. O contador fica **em memória**: correto para uma única instância; com
múltiplas instâncias/containers será necessário um store compartilhado (ex.: Redis).

Se `DATABASE_URL` ou `JWT_SECRET` estiverem ausentes ou inválidas, a
aplicação **falha imediatamente ao iniciar**, com uma mensagem clara
apontando o campo problemático (`src/config/env.ts`).

## Storage de documentos

Uploads e PDFs de contrato **não** dependem mais do disco do container. O
`DocumentService` e o `ContractService` falam apenas com a interface
`StorageDriver` (`src/shared/storage/`):

```text
Frontend → API (JWT + RBAC + officeId) → DocumentService → StorageDriver
                                                             ├─ local    (dev/testes)
                                                             └─ neon-s3  (produção) → bucket PRIVADO
```

- **Bucket privado, sem URL pública.** O download é sempre
  `GET /documents/:id/download`: o backend autentica, busca o documento com
  `{ id, officeId }` (documento de outro escritório → 404), abre o objeto e
  repassa por **stream**. O navegador nunca recebe credenciais nem link do bucket.
- **Chaves** `{officeId}/{uuid}.{ext}`; o nome original fica só em `Document.fileName`.
  A extensão é sanitizada e o driver rejeita qualquer chave fora desse formato
  (path traversal impossível). A chave é gravada em `Document.storagePath`.
- **Upload** (`@fastify/multipart`, 1 arquivo, `MAX_UPLOAD_SIZE_BYTES`): o backend confere
  extensão + MIME declarado + assinatura real do arquivo (magic bytes). Formatos aceitos:
  PDF, PNG, JPG, DOC, DOCX, XLS, XLSX e TXT. `virus.exe` renomeado para `.pdf` é recusado.
- **Consistência banco × storage** (o storage não entra na transação do Prisma):
  no upload, grava o objeto → cria `Document` + auditoria → se o banco falhar, remove o
  objeto (sem mascarar o erro original). Na exclusão, remove o registro primeiro e o
  objeto depois; se a remoção do objeto falhar, só sobra um objeto órfão (logado com a chave).
- **Resiliência**: o driver S3 repete erros transitórios (`503 SlowDown`, 5xx, 429, timeouts e
  resets de rede) com backoff exponencial + jitter, no máximo 4 tentativas. Erros permanentes
  (`AccessDenied`, `NoSuchKey`, `InvalidAccessKeyId`…) falham na hora.

### PDFs de contrato

`POST /contracts/:id/pdf` gera o PDF **sob demanda** a partir de `ContractVersion.content`
(nada vindo do frontend entra no PDF), calcula o **SHA-256** do mesmo Buffer que vai para o
storage e o grava em `Document.contentHash` (também exposto como `contentHash` na API).
Continua idempotente (uma versão = no máximo um PDF, `Document.contractVersionId` único). Como o PDF é
determinístico, se o objeto sumir do storage ele é regenerado na mesma chave ao pedir o PDF de novo.
Uploads manuais e documentos antigos ficam com `contentHash = null`.

### Configuração

Desenvolvimento/testes (padrão, sem credenciais):

```env
STORAGE_DRIVER=local
UPLOADS_DIR=./uploads
```

Produção (Render + Neon Object Storage) — defina em **Environment Variables** do serviço,
nunca em arquivo versionado:

```env
STORAGE_DRIVER=neon-s3
S3_ENDPOINT=https://your-object-storage-endpoint
S3_REGION=your-region
S3_BUCKET=your-private-bucket
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
```

Com `STORAGE_DRIVER=neon-s3`, a ausência de qualquer variável `S3_*` derruba a
inicialização listando o que falta. Com `STORAGE_DRIVER=local` em `NODE_ENV=production`, a
aplicação sobe, mas registra um aviso (o disco do Render é efêmero). A escolha do driver é
sempre explícita: nada muda sozinho conforme o ambiente.

### Migrando arquivos locais existentes

As chaves antigas (`{officeId}/{uuid}.{ext}`) já têm o formato novo, então basta copiar os arquivos
preservando a chave — sem alterar o banco e sem apagar nada:

```bash
# com STORAGE_DRIVER=neon-s3 e as variáveis S3_* exportadas
npm run storage:migrate-local -- --dry-run   # só mostra o que seria copiado
npm run storage:migrate-local                # copia; pode rodar de novo (idempotente)
```

Arquivos que já se perderam no disco efêmero não podem ser recuperados; PDFs de contrato voltam
sozinhos (regenerados) quando o PDF da versão é solicitado novamente.

### Plano B (não implementado)

Se o Neon Object Storage ficar indisponível para o projeto, basta um novo `StorageDriver`
(ex.: `PostgresBlobStorageDriver` sobre uma tabela `document_blobs` com `bytea`, limite de 5 MB por
arquivo) selecionado por `STORAGE_DRIVER`. Nenhum service precisa mudar.

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
| PATCH  | `/users/me/password` | sim (JWT) | Troca a própria senha; limpa `mustChangePassword` |
| GET    | `/users`       | ADMIN        | Lista usuários do escritório (`search`, `page`, `pageSize`) |
| POST   | `/users`       | ADMIN        | Cria usuário → `{ user, temporaryPassword }` (senha exibida **uma única vez**) |
| GET    | `/users/:id`   | ADMIN        | Detalhe (404 se for de outro escritório)        |
| PATCH  | `/users/:id/role`   | ADMIN   | `{ role }` — não vale para si mesmo nem para o último ADMIN ativo |
| PATCH  | `/users/:id/status` | ADMIN   | `{ status: ACTIVE\|INACTIVE }` — sem DELETE; não vale para si mesmo nem para o último ADMIN ativo |

Autenticação: header `Authorization: Bearer <accessToken>`.

A cada requisição autenticada o `authenticate` consulta o usuário no banco: usuário
inexistente, `INACTIVE` ou com `officeId` diferente do token → **401**, e o `role` usado é
sempre o **atual do banco** (o `role` do JWT não é fonte de verdade). Nas rotas de gestão de
usuários o `officeId` vem sempre da sessão, e usuário de outro escritório é tratado como 404.
Usuários criados pelo ADMIN nascem com `mustChangePassword = true` (o frontend exige a troca).

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
