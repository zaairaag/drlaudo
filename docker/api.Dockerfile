# API image: creates the generated Prisma Client and runs migrations before
# starting the server. No secret is baked into the image.
FROM node:22.22.2-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
RUN npm ci --ignore-scripts

FROM deps AS build
# Prisma config resolves DATABASE_URL; `generate` never opens a connection.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY tsconfig.base.json tsconfig.base.json
COPY packages/contract packages/contract
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM build AS qa
WORKDIR /app/apps/api
ENV NODE_ENV=test
CMD ["npm", "test"]

FROM node:22.22.2-alpine@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Dev dependencies stay installed: the Prisma CLI runs `migrate deploy` at boot
# and `tsx` executes the TypeScript sources. The image is not publicly sized.
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/package.json package.json
COPY --from=build --chown=node:node /app/tsconfig.base.json tsconfig.base.json
COPY --from=build --chown=node:node /app/packages/contract/package.json packages/contract/package.json
COPY --from=build --chown=node:node /app/packages/contract/dist packages/contract/dist
COPY --from=build --chown=node:node /app/apps/web/package.json apps/web/package.json
COPY --from=build --chown=node:node /app/apps/e2e/package.json apps/e2e/package.json
COPY --from=build --chown=node:node /app/apps/api/package.json apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/tsconfig.json apps/api/tsconfig.json
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY --from=build --chown=node:node /app/apps/api/prisma apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/src apps/api/src
WORKDIR /app/apps/api
EXPOSE 3333
USER node
# Migration and seed are explicit startup steps; the server itself only connects.
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npm start"]
