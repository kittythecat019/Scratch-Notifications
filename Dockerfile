FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y \
        python3 \
        python3-pip \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Cài uv bằng pip
RUN pip3 install --break-system-packages uv

# Kiểm tra uv
RUN which uv
RUN uv --version

COPY package*.json ./

RUN npm install

COPY requirements.txt ./

RUN pip3 install \
    --break-system-packages \
    --no-cache-dir \
    -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
