FROM node:20-alpine AS builder

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci

# Copia código fonte e compila TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Imagem de produção enxuta
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

# Copia build e arquivos públicos
COPY --from=builder /app/dist ./dist
COPY public/ ./public/

# Cria pastas para persistência de dados
RUN mkdir -p /app/data /app/auth_info_baileys /app/auth_info_portal

EXPOSE 3000

CMD ["node", "dist/index.js"]
