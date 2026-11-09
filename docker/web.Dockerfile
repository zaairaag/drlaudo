# Web image: builds the SPA with the real transport and serves it through Nginx.
FROM node:22.22.2-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN npm ci --ignore-scripts

COPY tsconfig.base.json tsconfig.base.json
COPY packages/contract packages/contract
COPY apps/web apps/web
COPY scripts/build-web.mjs scripts/build-web.mjs
# A build-time value is not a secret; mocks stay off in the shipped bundle.
ENV VITE_API_MOCKING=false
RUN npm run build -w apps/web

FROM nginx:1.28.2-alpine@sha256:5b4900b042ccfa8b0a73df622c3a60f2322faeb2be800cbee5aa7b44d241649e AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
