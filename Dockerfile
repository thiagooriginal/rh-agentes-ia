FROM node:20-alpine

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci

# Compila o projeto TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dependências de dev em segundos (sem re-download de rede)
RUN npm prune --omit=dev && npm cache clean --force

# Copia arquivos públicos da interface
COPY public/ ./public/

# Pastas para persistência dos dados
RUN mkdir -p /app/data /app/auth_info_baileys /app/auth_info_portal

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]
