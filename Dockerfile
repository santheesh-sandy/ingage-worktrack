FROM node:20-alpine
WORKDIR /app
COPY package.json server.js seed.js ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data TZ=Asia/Kolkata
VOLUME /data
EXPOSE 3000
CMD ["node","server.js"]
