# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Same-origin API in Docker: nginx proxies /api/ to backend:8001, so the
# build uses an empty VITE_API_URL (see src/api.ts).
# VITE_API_KEY is baked in at build time (Vite embeds VITE_* vars); it must
# match the backend API_KEY, so docker-compose passes it as a build arg.
ARG VITE_API_KEY=dev-api-key-change-me
ENV VITE_API_URL=""
ENV VITE_API_KEY=$VITE_API_KEY
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
