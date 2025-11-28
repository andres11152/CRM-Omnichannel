// Intentamos cargar e inicializar @prisma/client en tiempo de import.
// Si no está generado (error "Please run \"prisma generate\""), capturamos
// el error y exportamos un proxy que falla con un mensaje claro en tiempo de uso.

type PrismaClientType = import('@prisma/client').PrismaClient;

let _prisma: PrismaClientType | null = null;

function createErrorProxy(): PrismaClientType {
	const handler: ProxyHandler<any> = {
		get() {
			throw new Error(
				'Prisma client not initialized. Run "npx prisma generate" and restart the server.'
			);
		},
		apply() {
			throw new Error(
				'Prisma client not initialized. Run "npx prisma generate" and restart the server.'
			);
		},
	};
	return new Proxy({}, handler) as PrismaClientType;
}

try {
	const { PrismaClient } = require('@prisma/client');
	_prisma = new PrismaClient();
} catch (err) {
	console.error('Warning: @prisma/client could not be initialized.');
	console.error(err);
	_prisma = createErrorProxy();
}

export const prisma = _prisma as PrismaClientType;