# Deployment template, not a validated image. Pin a reviewed Node 24 base digest and native packages explicitly.
ARG NODE_BASE
FROM ${NODE_BASE}
ARG FFMPEG_PACKAGE_VERSION
ARG POPPLER_PACKAGE_VERSION
ARG BUBBLEWRAP_PACKAGE_VERSION
RUN test -n "$FFMPEG_PACKAGE_VERSION" && test -n "$POPPLER_PACKAGE_VERSION" && test -n "$BUBBLEWRAP_PACKAGE_VERSION" \
    && apt-get update \
    && apt-get install --no-install-recommends -y \
       ffmpeg="$FFMPEG_PACKAGE_VERSION" poppler-utils="$POPPLER_PACKAGE_VERSION" bubblewrap="$BUBBLEWRAP_PACKAGE_VERSION" \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy an already built, npm-locked workspace artifact. Do not bake secrets or .local into the image.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node node_modules ./node_modules
COPY --chown=node:node packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=node:node packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node packages/platform/package.json ./packages/platform/package.json
COPY --chown=node:node packages/platform/dist ./packages/platform/dist
COPY --chown=node:node services/media/package.json ./services/media/package.json
COPY --chown=node:node services/media/dist ./services/media/dist
USER node
ENV NODE_ENV=production MEDIA_PROCESS_SANDBOX=bwrap
# Set external CPU/memory/PID limits and a size-limited scratch volume; validate unprivileged user namespace support.
CMD ["node", "services/media/dist/composition/worker.js"]
