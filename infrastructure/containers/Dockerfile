FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/platform/package.json ./packages/platform/package.json
COPY services/gateway/package.json ./services/gateway/package.json
COPY services/identity/package.json ./services/identity/package.json
COPY services/catalog/package.json ./services/catalog/package.json
COPY services/media/package.json ./services/media/package.json
COPY services/inquiries/package.json ./services/inquiries/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.21.0-bookworm-slim
ARG SERVICE_NAME
ENV NODE_ENV=production HOST=0.0.0.0 SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/platform/dist ./packages/platform/dist
COPY --from=build --chown=node:node /app/packages/platform/package.json ./packages/platform/package.json
COPY --from=build --chown=node:node /app/services/${SERVICE_NAME}/dist ./services/${SERVICE_NAME}/dist
COPY --from=build --chown=node:node /app/services/${SERVICE_NAME}/package.json ./services/${SERVICE_NAME}/package.json
COPY --from=build --chown=node:node /app/scripts/container-main.mjs ./scripts/container-main.mjs
USER node
CMD ["node", "scripts/container-main.mjs"]

