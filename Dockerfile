FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install system dependencies needed for Puppeteer and Chrome to run headless
# This list is fairly comprehensive for Debian-based systems (like the node:slim image)
RUN apt-get update && apt-get install -yq \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    lsb-release \
    xdg-utils \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
# We installed Chrome manually, so tell Puppeteer not to download its own version.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

RUN npm install --production --ignore-scripts
# Using --ignore-scripts because some puppeteer post-install scripts might try to download chromium

# Copy app source code
COPY . .

# Expose the port the app runs on (Render will map this)
# This port number (3001) is a fallback if process.env.PORT is not set by Render.
# Your scraper_server.js should use `process.env.PORT || 3001`.
EXPOSE 3001

# Define the command to run your app
CMD [ "node", "scraper_server.js" ]