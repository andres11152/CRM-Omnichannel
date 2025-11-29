"use strict";
// Intentamos cargar e inicializar @prisma/client en tiempo de import.
// Si no está generado (error "Please run \"prisma generate\""), capturamos
// el error y exportamos un proxy que falla con un mensaje claro en tiempo de uso.
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
let _prisma = null;
function createErrorProxy() {
    const handler = {
        get() {
            throw new Error('Prisma client not initialized. Run "npx prisma generate" and restart the server.');
        },
        apply() {
            throw new Error('Prisma client not initialized. Run "npx prisma generate" and restart the server.');
        },
    };
    return new Proxy({}, handler);
}
try {
    const { PrismaClient } = require('@prisma/client');
    _prisma = new PrismaClient();
}
catch (err) {
    console.error('Warning: @prisma/client could not be initialized.');
    console.error(err);
    _prisma = createErrorProxy();
}
exports.prisma = _prisma;
