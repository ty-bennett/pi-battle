# Pi Battle Arena — Production Dockerfile
# Builds a lean Node.js image ready for Kubernetes deployment

FROM node:24-alpine

# Install production dependencies only
# Copy package files first so this layer is cached unless deps change
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy server
COPY server.js .

# server.js serves static files from ./public/
# Re-map the flat project layout into the expected directory structure
COPY index.html  ./public/index.html
COPY main.js     ./public/js/main.js
COPY style.css   ./public/css/style.css

# Hand ownership to the non-root user
EXPOSE 3000

STOPSIGNAL SIGTERM	

CMD ["npm", "run", "start"]
