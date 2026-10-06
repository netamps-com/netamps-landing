# ==============================================================================
# STAGE 1: BUILD (Multi-stage optimization)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies needed for node-gyp native builds (if any)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies) for compilation
RUN npm install

# Copy application source code
COPY src/ ./src/

# Compile TypeScript to JavaScript
RUN npm run build

# ==============================================================================
# STAGE 2: PRODUCTION RUNTIME (Minimal Attack Surface)
# ==============================================================================
FROM node:20-alpine

# Enforce SOC 2 Principle of Least Privilege: Do not run as root
RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp

WORKDIR /usr/src/app

# Copy package descriptors
COPY package*.json ./

# Install ONLY production dependencies (reduces image size & vulnerability surface)
RUN npm install --omit=dev

# Copy compiled JavaScript from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# Change ownership of the directory to the non-root user
RUN chown -R nodeapp:nodeapp /usr/src/app

# Switch to non-root user
USER nodeapp

# Harden container by explicitly declaring expected production port
EXPOSE 3000

# Set immutable node environment
ENV NODE_ENV=production

# Execute the application
CMD ["node", "dist/index.js"]
