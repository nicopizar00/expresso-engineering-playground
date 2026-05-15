FROM node:lts-alpine
WORKDIR /app
COPY src/api/server.js ./server.js
EXPOSE 3000
CMD ["node", "server.js"]
