FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
COPY scripts/build.mjs scripts/build.mjs
COPY public public
COPY content content
COPY server/worker.mjs server/worker.mjs
COPY drizzle drizzle
RUN node scripts/build.mjs

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist dist
COPY server/node.mjs server/node.mjs
COPY server/media.mjs server/media.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/data/timuroid.sqlite
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/node.mjs"]
