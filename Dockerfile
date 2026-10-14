FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# SQLite file lands here (bind a volume if you want persistence)
RUN mkdir -p /app/data
ENV DATABASE_URL="file:/app/data/prod.db"

CMD ["npx", "tsx", "scripts/start-prod.ts"]
