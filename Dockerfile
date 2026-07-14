FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
ARG VITE_FEATURE_DATABASE_REALTIME=true
ENV VITE_FEATURE_DATABASE_REALTIME=${VITE_FEATURE_DATABASE_REALTIME}
RUN npm run build:web
RUN npx esbuild apps/server/src/serverful.ts apps/server/src/scripts/migrate.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --define:import.meta.url='"file:///app/dist/server/serverful.js"' \
  --outdir=dist/server

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=3000 \
  NOTELAB_WEB_DIST_DIR=/app/apps/web/dist \
  DRIZZLE_MIGRATIONS_DIR=/app/apps/server/drizzle

WORKDIR /app

RUN groupadd --system notelab \
  && useradd --system --gid notelab --home /app notelab

COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh \
  && chown -R notelab:notelab /app

USER notelab

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/server/serverful.js"]
