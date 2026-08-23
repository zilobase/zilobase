FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci
ARG VITE_FEATURE_DATABASE_REALTIME=true
ENV VITE_FEATURE_DATABASE_REALTIME=${VITE_FEATURE_DATABASE_REALTIME}
RUN npm run build:web
RUN ./apps/web/node_modules/.bin/esbuild apps/server/src/serverful.ts apps/server/src/scripts/migrate.ts \
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
  ZILOBASE_WEB_DIST_DIR=/app/apps/web/dist \
  DRIZZLE_MIGRATIONS_DIR=/app/apps/server/drizzle

WORKDIR /app

RUN groupadd --system zilobase \
  && useradd --system --gid zilobase --home /app zilobase

COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/apps/server/drizzle ./apps/server/drizzle
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh \
  && chown -R zilobase:zilobase /app

USER zilobase

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/server/serverful.js"]
