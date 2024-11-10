# Use Node.js image as base
FROM node:16-alpine

# Set working directory
WORKDIR /backend

# Copy package.json and package-lock.json files to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

COPY wait-for.sh /wait-for.sh
RUN sed -i 's/\r$//' /wait-for.sh && chmod +x /wait-for.sh

# Build the TypeScript application
RUN npm run build

# Expose the application port
EXPOSE 5001
RUN apk add --no-cache redis

# Set wait-for.sh as entrypoint to wait for Redis, then start the application
ENTRYPOINT ["/wait-for.sh", "redis-service", "6379", "--"]

# Define the default command to start the backend application after wait-for.sh
CMD ["node", "dist/app.js"]
