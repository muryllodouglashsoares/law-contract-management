# syntax=docker/dockerfile:1
#
# Imagem de produção do frontend do LexContract (React + Vite).
#
# Build multi-stage:
#   1) "build"  — Node.js instala as dependências e gera os estáticos em dist/
#   2) runtime  — Nginx serve dist/ como arquivos estáticos, com fallback de
#                 rotas para suportar o client-side routing do React Router.
#
# VITE_API_URL é lido em build-time pelo Vite (import.meta.env) e fica
# embutido no bundle gerado — não é uma variável de runtime do container.
# Para apontar para uma API diferente de http://localhost:3333, informe-a
# no build:
#
#   docker build --build-arg VITE_API_URL=https://api.seudominio.com -t lexcontract-frontend .

# ---- Build ---------------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---- Runtime (Nginx) -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
