import express from 'express';
import { createServer } from 'http';
import { verifyWebhook, handleIncomingWebhook } from './src/controllers/metaController';
import { gateway } from './src/gateways/socketGateway'; // Ya estaba bien
import { globalErrorHandler } from './src/middleware/errorMiddleware';
import { AppError } from './src/utils/AppError';
import { Logger } from './src/utils/logger';
import { securityMiddleware } from './src/middleware/securityMiddleware';
import { apiLimiter, authLimiter } from './src/middleware/rateLimitMiddleware';

// --- NEW IMPORTS ---
import { createCheckoutSession, createPortalSession, stripeWebhook } from './src/controllers/paymentController';
import { registerCompany } from './src/controllers/onboardingController';
import authRouter from './src/routes/authRoutes';
import userRouter from './src/routes/userRoutes';
import postRouter from './src/routes/postRoutes';
import replyRouter from './src/routes/replyRoutes';
import adminRouter from './src/routes/adminRoutes';
import conversationRouter from './src/routes/conversationRoutes';
import { protect } from './src/middleware/authMiddleware';
import { createCheckoutSessionSchema } from './src/middleware/paymentSchemas';
import { validate } from './src/middleware/validationMiddleware';
import { superAdminGuard } from './src/middleware/superAdminMiddleware';


// HANDLE UNCAUGHT EXCEPTIONS (Sync Errors)
(process as any).on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

const app = express();
const httpServer = createServer(app);

// --- STRIPE WEBHOOK (Must be before JSON parser) ---
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// Configurar Express para que confíe en el proxy inverso (ej. Nginx, Heroku, etc.)
// Esto es crucial para que el rate-limiting funcione correctamente con req.ip.
app.set('trust proxy', 1);

// --- SECURITY & PARSING ---
app.use(express.json());
// Aplicamos Helmet y CORS. El Rate Limiting se aplicará por ruta.
// Es crucial que securityMiddleware NO aplique un rate-limiter global.
securityMiddleware(app); 

// --- HTTP LOGGER ---
app.use((req, res, next) => {
  Logger.http(`${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'API Service is running and healthy.',
        environment: process.env.NODE_ENV || 'development'
    });
});

// --- PUBLIC ROUTES ---
app.post('/api/onboarding', authLimiter, registerCompany); // Usamos app.post para ser explícitos
app.get('/webhook', verifyWebhook);
app.post('/webhook', handleIncomingWebhook);
app.use('/api/auth', authLimiter, authRouter); // Aplicamos el limiter de auth

// --- ADMIN ROUTES (Super Admin Only) ---
// Movemos esto aquí temporalmente para descartar conflictos de enrutamiento.
app.use('/api/admin', protect, superAdminGuard, adminRouter);

// --- PROTECTED ROUTES ---
// Todas las rutas definidas en los siguientes routers requerirán un token JWT
app.use('/api/users', apiLimiter, protect, userRouter);
app.use('/api/posts', apiLimiter, protect, postRouter);
app.use('/api/replies', apiLimiter, protect, replyRouter);
app.use('/api/conversations', apiLimiter, protect, conversationRouter);
app.post('/api/create-checkout-session', apiLimiter, protect, validate(createCheckoutSessionSchema), createCheckoutSession);
app.post('/api/create-portal-session', apiLimiter, protect, createPortalSession);








// --- 404 HANDLER ---
// Middleware para capturar todas las rutas no encontradas. Debe ir después de todas las demás rutas.
app.use((req, res, next) => {
  next(new AppError(`No se encontró la ruta '${req.originalUrl}' en este servidor`, 404));
});

// --- GLOBAL ERROR HANDLER (Must be last) ---
app.use(globalErrorHandler);

// HANDLE UNHANDLED REJECTIONS (Async Errors)
(process as any).on('unhandledRejection', (err: Error) => {
  Logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  Logger.error(err.name, err.message);
  httpServer.close(() => {
    process.exit(1);
  });
});

// --- SERVER INITIALIZATION ---
const PORT = process.env.PORT || 4000;

// Solo inicia el servidor si el archivo se ejecuta directamente (no durante las pruebas)
if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`✅ ¡ÉXITO! CRM SaaS Backend corriendo en el puerto ${PORT}`);
    // Inicializa el gateway solo cuando el servidor principal arranca
    gateway.initialize(httpServer).catch(err => {
      Logger.warn(`⚠️  Socket.io/Redis Warning: ${err.message}`);
    });
  });
}

// Exportamos tanto la app como el servidor http para flexibilidad
export { app, httpServer };