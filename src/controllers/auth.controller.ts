import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const loginHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // 1. Validar que el email y la contraseña existan
    if (!email || !password) {
      return res.status(400).json({
        status: 'fail',
        message: 'Por favor, proporcione un email y una contraseña.',
      });
    }

    // 2. Buscar el usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // 3. Validar si el usuario existe
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'Email o contraseña incorrectos',
      });
    }

    // 4. Validar la contraseña (solo si el usuario existe)
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        status: 'fail',
        message: 'Email o contraseña incorrectos',
      });
    }
    // 4. Validar que el secreto del JWT esté configurado
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('Error: La variable de entorno JWT_SECRET no está definida.');
      return res.status(500).json({
        status: 'error',
        message: 'Error de configuración interna del servidor.',
      });
    }

    // 5. Si todo es correcto, firmar el token JWT
    const expiresIn = process.env.JWT_EXPIRES_IN || '90d'; // Usar '90d' como valor por defecto

    // Crear el payload explícitamente para asegurar los tipos correctos
    const payload = { id: String(user.id) };

    const token = jwt.sign(payload as object, jwtSecret, {
      expiresIn,
    });

    // 6. Enviar el token al cliente, cumpliendo con la especificación de la API
    res.status(200).json({
      status: 'success',
      token,
    });

  } catch (error: any) {
    console.error('Error en el login:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error interno del servidor',
    });
  }
};

// Aquí iría la lógica para signup (registro)
// export const signupHandler = async (req: Request, res: Response) => { ... }