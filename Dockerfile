# COPE Agent HTTP Server Docker Image
# Runs the HTTP server for remote access

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --omit=dev

# Copy built files and config
COPY dist/ ./dist/
COPY config/ ./config/

# Expose the HTTP server port
EXPOSE 3847

# Run the HTTP server
CMD ["node", "dist/http-server.js"]
