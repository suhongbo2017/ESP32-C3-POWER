FROM node:22-alpine

WORKDIR /app
COPY app/package.json ./package.json
COPY app/server.js ./server.js

ENV NODE_ENV=production
EXPOSE 8310
CMD ["node", "server.js"]
