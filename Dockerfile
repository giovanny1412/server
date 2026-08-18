FROM node:18

# Instalar arduino-cli
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh

# Configurar el core de ESP32
RUN arduino-cli config init
RUN arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
RUN arduino-cli core update-index
RUN arduino-cli core install esp32:esp32

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
