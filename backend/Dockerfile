FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate

RUN npm run build

FROM node:18-alpine 

WORKDIR /app

RUN apk add --no-cache dumb-init && \
    apk upgrade --no-cache

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs prisma ./prisma/

USER nodejs

RUN npm ci --only=production && npx prisma generate && npm cache clean --force

COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist

EXPOSE 50136

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:50136/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/server.js"]