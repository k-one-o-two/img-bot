# Specify base image
FROM node:18-alpine

# Specify the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

# Run the app
CMD ["npm", "start"]