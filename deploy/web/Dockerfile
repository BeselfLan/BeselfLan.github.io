# The site image for topology (b): the static export, served by Caddy as a user
# that is not root. Build it with Compose from the repo root (the local override
# has the command), not with plain `docker build`: a host without buildx falls
# back to the legacy builder, which ignores Dockerfile.dockerignore and rejects
# `RUN --mount`. Dockerfile.dockerignore next to this file is the allowlist.
# NEXT_PUBLIC_API_URL is baked into the export and becomes the Content-Security-
# Policy's API origin (deploy/web/Caddyfile), so an image is built for one API
# host.
FROM node:24-alpine AS build
WORKDIR /app
# npm ci checks the lockfile against every workspace, so all three are copied.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/content/package.json packages/content/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace web --ignore-scripts --no-audit --no-fund
COPY packages/content/src packages/content/src
COPY apps/web/next.config.ts apps/web/tsconfig.json apps/web/
COPY apps/web/src apps/web/src
COPY apps/web/public apps/web/public
# Declared this late on purpose: above npm ci, every change of API origin would
# invalidate the install layer.
ARG NEXT_PUBLIC_API_URL=
RUN node -e 'const u = process.env.NEXT_PUBLIC_API_URL ?? ""; let ok = u === ""; try { ok ||= new URL(u).origin === u; } catch {} if (!ok) { console.error("NEXT_PUBLIC_API_URL must be empty or an origin: scheme, host and optional port, with no path and no trailing slash"); process.exit(1); }'
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace web

FROM caddy:2-alpine
ARG NEXT_PUBLIC_API_URL=
ENV API_ORIGIN=$NEXT_PUBLIC_API_URL
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/out /srv
USER 65534:65534
EXPOSE 8080
# busybox wget, so it works on this base image. The short start interval makes
# `compose up --wait` return as soon as the site is up.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"]
