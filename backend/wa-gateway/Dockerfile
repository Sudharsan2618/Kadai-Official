# syntax=docker/dockerfile:1
# Kadai WhatsApp gateway — Baileys socket host. Runs the TypeScript directly
# with tsx (same convention as whatsapp-harness), no build step.

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Cloud Run injects PORT (default 8080); config.ts reads process.env.PORT.
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "run", "start:prod"]
