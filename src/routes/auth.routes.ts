import express from 'express';
import { loginHandler } from './../controllers/auth.controller';

const router = express.Router();

// Define la ruta POST para el login
router.post('/login', loginHandler);

// Aquí se definiría la ruta para signup
// router.post('/signup', signupHandler);

export default router;