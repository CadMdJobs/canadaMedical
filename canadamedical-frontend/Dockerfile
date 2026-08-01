# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Dependencies: install node_modules with Bun
# Use node:20-alpine as base (minimal CVE surface), install Bun on top.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

# Install Bun via official install script (pinned version for reproducibility)
RUN apk add --no-cache curl bash \
    && curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.18" \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /root/.bun

WORKDIR /app

# Copy only manifests first — layer cache reuse on subsequent builds
COPY package.json bun.lock* bun.lockb* ./

RUN bun install --frozen-lockfile


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Builder: Vite production bundle
# VITE_API_URL injected as build arg by CI — never hardcoded here.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache curl bash \
    && curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.18" \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /root/.bun

ARG VITE_API_URL
ARG VITE_WS_URL

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN bun run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Runtime: nginx:1.27-alpine (minimal, well-patched)
# Zero Node / Bun in the final image — pure static serving.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
