# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Dependencies: install node_modules with Bun
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache curl bash \
    && curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.18" \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && rm -rf /root/.bun

WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./

RUN bun install


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Builder: Vite production bundle + SPA shell prerender
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

# After build, copy the prerendered shell (/_shell/index.html) to index.html
# TanStack Start SPA mode prerenders the app shell during `vite build`.
# If prerender produced /_shell/index.html, promote it to the root.
RUN if [ -f dist/client/_shell.html ]; then \
        cp dist/client/_shell.html dist/client/index.html; \
        echo "Copied _shell.html to index.html"; \
    elif [ -f dist/client/index.html ]; then \
        echo "index.html already exists"; \
    else \
        echo "ERROR: No shell HTML found" && ls dist/client/ && exit 1; \
    fi


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — Runtime: nginx:1.27-alpine
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist/client /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
