# --- STAGE 1: BUILDER ---
FROM node:22-alpine AS builder

WORKDIR /app

# 1. Install build tools and ALL dependencies (including 'terser')
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm install

# 2. Copy source code
COPY . .

# 3. Run the minification script for frontend apps
RUN npm run minify

# --- STAGE 2: PRODUCTION ---
FROM node:22-alpine

WORKDIR /app

# 1. Install build tools and ONLY production dependencies (saves space)
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm install --production

# 2. Copy the code (including the minified JS) from the builder stage
COPY --from=builder /app .

# 3. Expose the Default Application Port
EXPOSE 3000

# 4. Start the Unified Server Script
CMD ["npm", "start"]
