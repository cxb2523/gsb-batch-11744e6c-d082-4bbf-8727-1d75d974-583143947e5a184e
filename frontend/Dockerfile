# GRID frontend (Next.js 15). Build:
#   docker build -f frontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_FRONTEND_URL=https://app.example.com \
#     -t grid-frontend ./frontend
FROM node:22-alpine AS base
WORKDIR /app

# ---------- dependencies ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- build ----------
FROM base AS builder

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, not read
# from the environment at runtime. They must be passed here, and an image built
# for staging cannot be re-pointed at production by changing the pod's env.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_FRONTEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_FRONTEND_URL=$NEXT_PUBLIC_FRONTEND_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM base AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 10001 -S grid && adduser -u 10001 -S grid -G grid

# The standalone output already contains the pruned node_modules and server.js;
# static/ is served from disk beside it. (There is no public/ in this project —
# add a COPY for it if one is ever introduced.)
COPY --from=builder --chown=grid:grid /app/.next/standalone ./
COPY --from=builder --chown=grid:grid /app/.next/static ./.next/static

USER grid
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
