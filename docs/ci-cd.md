# CI/CD e deploy

O GitHub Actions (`.github/workflows/ci.yml`) roda em todo `push` para `main` e em toda `pull request`.

| Evento         | Jobs                                                      |
| -------------- | --------------------------------------------------------- |
| Pull Request   | `frontend` · `backend` · `docker` · `e2e`                 |
| Push em `main` | `frontend` · `backend` · `docker` · `e2e` → **`deploy`**  |

- **frontend**: `npm ci` → `npm run typecheck` → `npm run build` (nessa ordem).
- **backend**: `npm ci`, checagem de tipos (`npm run typecheck`), aplicação das migrations e execução dos testes (unitários + integração, com um PostgreSQL de serviço no próprio runner), e `npm run build`.
- **docker**: garante que as imagens Docker do frontend e do backend continuam buildáveis (`docker build`), rodando somente depois que `frontend` e `backend` passam.
- **e2e**: sobe um PostgreSQL **próprio** (`lexcontract_e2e`, separado do banco do job `backend`), aplica migrations + seed, inicia o backend em modo produção (`build` + `node dist/src/server.js`), builda o frontend e o serve com `vite preview`, e executa os 4 fluxos do Playwright (Chromium, com cache do navegador). Em caso de falha, publica o relatório HTML e os traces como artifact (nunca em execuções bem-sucedidas). Veja [Testes E2E](testes-e2e.md).
- **deploy**: depende de `[frontend, backend, e2e, docker]` e só roda em `push` para `main` — **nunca em Pull Request**. Dispara os Deploy Hooks do Render (backend) e do Cloudflare Pages (frontend) com `curl`.

Além do CI, `.github/workflows/contract-renewal-alerts.yml` é um cron diário (e `workflow_dispatch`) que chama o endpoint interno de alertas de renovação — configuração em [`backend/README.md`](../backend/README.md#cron-diário-alertas-de-renovação).

## Deploy automático (Deploy Hooks)

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
- **Desative o auto-deploy por push** no Render e no Cloudflare Pages. Caso contrário eles publicam a cada push em paralelo ao CI, e o encadeamento "só publica depois de passar nos gates" deixa de valer. Passo a passo no fim desta página.
- O Cloudflare Pages precisa ter a variável `VITE_SENTRY_DSN` (opcional) disponível **no build**, pois ela é embutida no bundle e na CSP.

**Concorrência.** O `concurrency` do workflow cancela execuções antigas em PRs/branches, mas **não em `main`**: lá as execuções ficam em fila (uma rodando + a mais recente aguardando). Assim, um push novo nunca interrompe um `deploy` em andamento no meio (o que deixaria backend e frontend em versões diferentes), e dois deploys nunca se sobrepõem.

**Migrations em produção.** `prisma migrate deploy` roda **no startup do container do backend** (`backend/Dockerfile`: `npx prisma migrate deploy && node dist/src/server.js`). Não há etapa separada de migration. Consequências operacionais:

- migration e startup estão acoplados: **se a migration falhar, a API não sobe** (o Render mantém a versão anterior no ar até o novo deploy ficar saudável, mas o deploy falha);
- migrations destrutivas ou longas atrasam o startup — prefira migrations aditivas e compatíveis com a versão anterior do código;
- evite **deploys concorrentes** (dois containers rodando `migrate deploy` ao mesmo tempo): o `concurrency` acima já impede que o CI faça isso, mas evite também disparar deploys manuais em paralelo.

### Passo a passo manual (uma única vez)

1. Render → serviço do backend → *Settings → Deploy Hook*: crie o hook e salve a URL no secret `RENDER_DEPLOY_HOOK_URL`.
2. Cloudflare Pages → projeto do frontend → *Settings → Builds & deployments → Deploy hooks*: crie o hook e salve a URL no secret `CLOUDFLARE_PAGES_DEPLOY_HOOK_URL`.
3. Render → *Settings → Build & Deploy → Auto-Deploy*: **Off**. O deploy passa a ser feito só pelo Deploy Hook disparado pelo GitHub Actions.
4. Cloudflare Pages → *Settings → Builds → Branch control*: desative os deploys automáticos da branch de produção, mantendo o Deploy Hook (o nome exato da opção pode variar conforme a versão do painel).

## Health checks

Os endpoints são `GET /health` e `GET /health/db`.

- **Health Check do Render**: use **`/health`**. Ele não depende do banco, então uma oscilação do Neon não reinicia a API.
- **Monitoramento externo** (uptime monitor, alertas): use `/health/db` se quiser acompanhar também a conectividade com o banco.
  > O Neon pode ter *cold start* / latência transitória e o `/health/db` pode responder `503` nesses momentos. **Não use `/health/db` como Health Check do Render**: isso pode provocar reinícios indevidos do serviço.
