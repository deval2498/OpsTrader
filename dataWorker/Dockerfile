FROM node:16-alpine

WORKDIR /backend

COPY package*.json ./

RUN npm install

COPY . .

COPY wait-for.sh /wait-for.sh
RUN chmod +x /wait-for.sh  # Make the wait-for script executable

RUN npm run build

RUN apk add --no-cache redis

ENTRYPOINT ["/wait-for.sh", "redis-service", "6379", "--"]

CMD ["node", "dist/index.js"]