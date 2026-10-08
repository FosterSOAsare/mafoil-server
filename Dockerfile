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

# Environment variables (MONGO_URL, SECRET, ...) are provided at runtime, e.g. `docker run --env-file .env`
CMD ["node", "src/server.js"]
