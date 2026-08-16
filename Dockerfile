FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

FROM base AS deps
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm install --workspaces --include-workspace-root

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY . .
RUN cd client && npm run build
RUN cd server && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && apk del tzdata

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/client/package*.json ./client/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

RUN mkdir -p /app/server/data /app/server/uploads
VOLUME ["/app/server/data", "/app/server/uploads"]

EXPOSE 3001
WORKDIR /app/server
CMD ["node", "dist/index.js"]
