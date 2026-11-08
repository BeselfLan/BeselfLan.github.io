# Build from the repo root: docker build -f apps/api/Dockerfile .
# The root lockfile and packages/content/src/schema.ts are needed, so the
# context is the root. Dockerfile.dockerignore next to this file is the allowlist.
FROM node:24-alpine AS manifests
WORKDIR /app
# npm ci checks the lockfile against every workspace, so all three are copied.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/content/package.json packages/content/

FROM manifests AS build
RUN --mount=type=cache,target=/root/.npm npm ci --workspace api --ignore-scripts --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/
COPY apps/api/src apps/api/src
COPY packages/content/src/schema.ts packages/content/src/
RUN npm run build --workspace api

FROM manifests AS runtime
# production turns the API's own file fallback off; Caddy serves the files.
ENV NODE_ENV=production PORT=8080 MEDIA_DIR=/media
RUN --mount=type=cache,target=/root/.npm npm ci --workspace api --omit=dev --ignore-scripts --no-audit --no-fund \
 && mkdir -p /media && chown node:node /media
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 8080
# Node's own fetch, so it works on any base image. The short start interval
# makes `compose up --wait` return as soon as the API is up.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/api/dist/apps/api/src/index.js"]
