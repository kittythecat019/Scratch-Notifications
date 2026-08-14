FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y nodejs npm curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 10000

CMD ["npm", "start"]
