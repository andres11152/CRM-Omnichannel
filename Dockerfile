# Etapa 1: Construcción de la aplicación
FROM node:18-alpine AS builder

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalar OpenSSL y Git (necesario para algunas dependencias)
RUN apk add --no-cache openssl git

# Copiar los archivos de dependencias y el schema de Prisma
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias de producción y desarrollo
RUN npm install --legacy-peer-deps

# Copiar el resto del código fuente de la aplicación
COPY . .

# Compilar el código de TypeScript a JavaScript
RUN npm run build

# Etapa 2: Creación de la imagen final optimizada
FROM node:18-alpine

WORKDIR /app

# Instalar OpenSSL y Git también en la etapa final
RUN apk add --no-cache openssl git

# Copiar solo las dependencias de producción desde la etapa de construcción
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Ejecutar npm install para generar los binarios necesarios (como 'prisma') en node_modules/.bin
RUN npm install --omit=dev --legacy-peer-deps

# Copiar el código compilado (JavaScript) y el schema de Prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Exponer el puerto en el que corre la aplicación
EXPOSE 4000

# Comando para ejecutar las migraciones y arrancar la aplicación
CMD ["sh", "-c", "npx prisma migrate deploy && node --max-old-space-size=2048 --expose-gc dist/server.js"]
