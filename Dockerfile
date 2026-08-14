FROM node:22-bookworm-slim

WORKDIR /app

# Python + curl + uv
RUN apt-get update \
    && apt-get install -y python3 python3-pip curl \
    && rm -rf /var/lib/apt/lists/*

# Cài uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# Đưa uv vào PATH
ENV PATH="/root/.local/bin:${PATH}"

# Node dependencies
COPY package*.json ./

RUN npm install

# Python dependencies
COPY requirements.txt ./

RUN pip3 install \
    --no-cache-dir \
    --break-system-packages \
    -r requirements.txt

# Source code
COPY . .

EXPOSE 10000

CMD ["npm", "start"]
