# --- STAGE 1: BUILDER ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools and ALL dependencies (including 'terser').
# Keeping package*.json copy separate so this layer caches on source-only changes.
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm install

# Copy source code
COPY . .

# Minify frontend apps, then prune dev deps in one layer
RUN npm run minify && npm prune --production

# --- STAGE 2: PRODUCTION ---
FROM node:22-alpine

WORKDIR /app

# Copy the built app (minified JS + pruned node_modules) from builder.
# No npm install needed - node_modules is already production-only.
COPY --from=builder /app .

# Expose the default application port
EXPOSE 3000

# Start the unified server script
CMD ["npm", "start"]
