# --- build stage (compiles better-sqlite3 native bindings) ---
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# --- runtime stage ---
FROM node:20-alpine
RUN apk add --no-cache tini wget
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY server.js ./
COPY public ./public

RUN mkdir -p /data
VOLUME ["/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/data/votes.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://localhost:3000/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
