# syntax=docker/dockerfile:1
# T-5-00 (D-66): one image, API + static frontend on one port, MCP and backup job as other entry modes.
# Local-first (D-09): built and run on a developer machine; no remote deployment from this file.

# ---- build stage: native toolchain for better-sqlite3 fallback builds, full deps, `npm run build`
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
# Sources the build needs: docs/ is bundled into the Help page via ?raw imports.
COPY tsconfig.json tsup.config.ts vite.config.ts index.html ./
COPY public ./public
COPY docs ./docs
COPY src ./src
RUN npm run build

# ---- runtime stage: production deps only, non-root, same glibc base as the build
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0 \
    E3_DB_PATH=/data/e3-tracking.sqlite \
    E3_FILES_PATH=/data/files \
    E3_SANDBOX_BACKUP_PATH=/app/samples/sandbox-project-backup.json
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Native toolchain is only needed if better-sqlite3 has no prebuilt binary; removed again in the same layer.
RUN npm ci --omit=dev && npm cache clean --force \
    && apt-get purge -y python3 make g++ && apt-get autoremove -y --purge && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/api/_backend ./api/_backend
COPY --from=build /app/dist ./dist
COPY .claude/team/samples/sandbox-project-backup.json ./samples/sandbox-project-backup.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN sed -i 's/$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh && mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
# ENTRYPOINT_MODE: app (default) | mcp (stdio, `docker compose run -T --rm mcp`) | backup (nightly job loop)
CMD ["app"]
