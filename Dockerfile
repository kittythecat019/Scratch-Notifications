FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y \
        python3 \
        python3-pip \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Cài uv vào /usr/local/bin
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && cp /root/.local/bin/uv /usr/local/bin/uv \
    && chmod +x /usr/local/bin/uv

# Kiểm tra uv ngay lúc BUILD
RUN /usr/local/bin/uv --version

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
