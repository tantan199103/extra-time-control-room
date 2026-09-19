FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY api ./api
COPY src/lib/payment-config.js ./src/lib/payment-config.js
COPY src/lib/google-merchant.js ./src/lib/google-merchant.js
COPY src/lib/listing-media.js ./src/lib/listing-media.js
COPY src/lib/image-privacy.js ./src/lib/image-privacy.js
COPY backend/src ./backend/src

EXPOSE 8787
CMD ["node", "backend/src/server.mjs"]
