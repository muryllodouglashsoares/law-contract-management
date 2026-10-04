# Testes E2E

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
