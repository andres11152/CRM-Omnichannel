import request from 'supertest';
import { app } from '../server'; // Solo necesitamos la app de Express
import { prisma } from '../prisma';

describe('Authentication API', () => {

  // Cerramos la conexión de Prisma después de todas las pruebas para evitar que Jest se quede colgado.
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/login', () => {
    
    it('debería autenticar a un usuario con credenciales correctas y devolver un token', async () => {
      // Arrange: La data de prueba que enviaremos
      const loginData = {
        email: 'master@reply.com', // Usuario creado por el script de seed
        password: 'password123',
      };

      // Act: Hacemos la petición a la API
      const response = await request(app) // Usamos la app de Express directamente
        .post('/api/auth/login')
        .send(loginData);

      // Assert: Verificamos la respuesta
      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('token'); // Verificamos que la respuesta contenga un token
    });

    it('debería rechazar a un usuario con contraseña incorrecta', async () => {
      // Arrange
      const loginData = {
        email: 'master@reply.com',
        password: 'wrongpassword',
      };

      // Act
      const response = await request(app) // Usamos la app de Express directamente
        .post('/api/auth/login')
        .send(loginData);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('message', 'Email o contraseña incorrectos');
    });
  });
});