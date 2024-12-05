# Use a smaller image for the runtime
FROM node:16-slim

# Set the working directory in the container
WORKDIR /app

# Copy only the built application files from the local dist folder to the container
COPY /dist /app/dist

# Copy package.json and package-lock.json (or yarn.lock) to the working directory
COPY package*.json ./
COPY /.env /app/.env

# Install only production dependencies
RUN npm install --only=production

# Set environment variable for the Node.js application
ENV NODE_ENV=production

# Command to run the application
CMD npm run serve

# Expose the port your application runs on
EXPOSE 8000