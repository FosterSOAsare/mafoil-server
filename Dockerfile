FROM node:24-slim

WORKDIR /app

# Install production dependencies first so this layer is cached between code changes
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the application source (see .dockerignore for what is excluded)
COPY src ./src

ENV NODE_ENV=production

# Run as the unprivileged user that ships with the Node image
USER node

EXPOSE 8000

# Healthy only while the API is up and connected to the database (GET /health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://localhost:' + (process.env.PORT || 8000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Environment variables (MONGO_URL, SECRET, ...) are provided at runtime, e.g. `docker run --env-file .env`
CMD ["node", "src/server.js"]
