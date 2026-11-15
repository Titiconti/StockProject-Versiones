# StockProject Nube: servidor de solo lectura. Sin dependencias npm.
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/datos
WORKDIR /app
COPY servidor.js panel.html ./
RUN mkdir -p /datos && chown node:node /datos
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "servidor.js"]
