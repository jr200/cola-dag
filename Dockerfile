# ---- builder ----
FROM node:25-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runner ----
FROM node:25-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server.js vite-plugin-graph-api.js ./
COPY src/dot-parser.js src/styling.js ./src/
COPY public/default.dot ./public/

USER app
EXPOSE 3000
CMD ["node", "server.js"]
