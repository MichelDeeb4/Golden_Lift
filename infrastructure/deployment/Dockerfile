FROM node:24.21.0-bookworm-slim AS build
WORKDIR /workspace
COPY . .
RUN npm ci --ignore-scripts --no-audit --no-fund && npm run build
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOST=0.0.0.0
USER node
ARG APP=erp-api
ENV TARGET_APP=$APP PORT=4100
CMD ["node","packages/tooling/container-start.mjs"]
