import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';

describe('Users API', () => {
  let agentToken: string;
  let agentUserId: string;
  let masterUserId: string;

  // Antes de todas las pruebas, obtenemos un token y el ID de un usuario 'AGENT'
  beforeAll(async () => {
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent@reply.com',
        password: 'password123',
      });
    agentToken = agentLoginRes.body.token;

    const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
    agentUserId = agentUser!.id;

    // También obtenemos el ID de otro usuario para las pruebas de autorización
    const masterUser = await prisma.user.findUnique({ where: { email: 'master@reply.com' } });
    masterUserId = masterUser!.id;
  });

  // Después de todas las pruebas, cerramos la conexión de Prisma
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/users', () => {
    it('debería obtener una lista de todos los usuarios para un usuario autenticado', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.users)).toBe(true);
      // Debería haber al menos los 3 usuarios del seed
      expect(response.body.results).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GET /api/users/:id', () => {
    it('debería obtener los detalles de un usuario específico por su ID', async () => {
      const response = await request(app)
        .get(`/api/users/${agentUserId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.user.id).toBe(agentUserId);
      expect(response.body.data.user.email).toBe('agent@reply.com');
    });

    it('debería devolver un 404 si el usuario no existe', async () => {
      const response = await request(app)
        .get('/api/users/id_que_no_existe')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('debería permitir a un usuario actualizar su propio nombre', async () => {
      const updatedData = { name: 'Agente Actualizado' };

      const response = await request(app)
        .patch(`/api/users/${agentUserId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send(updatedData);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.user.name).toBe(updatedData.name);

      // Revertimos el cambio para no afectar otras pruebas
      await prisma.user.update({
        where: { id: agentUserId },
        data: { name: 'Agent User' },
      });
    });

    it('debería denegar la actualización si un usuario intenta editar a otro', async () => {
      const response = await request(app)
        .patch(`/api/users/${masterUserId}`) // Intentamos editar al usuario MASTER
        .set('Authorization', `Bearer ${agentToken}`) // Usando el token del AGENTE
        .send({ name: 'Intento de edición no autorizado' });

      expect(response.statusCode).toBe(403);
      expect(response.body.message).toContain('No tienes permiso para editar este perfil');
    });
  });

  describe('DELETE /api/users/:id', () => {
    let userToDeleteId: string;

    beforeEach(async () => {
      // Creamos un usuario temporal para ser eliminado
      const user = await prisma.user.create({
        data: {
          email: `delete-me-${Date.now()}@test.com`,
          password: 'password',
          role: 'USER',
        },
      });
      userToDeleteId = user.id;
    });

    it('debería denegar la eliminación de un usuario (lógica de negocio pendiente)', async () => {
      const response = await request(app)
        .delete(`/api/users/${userToDeleteId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.message).toContain('No tienes permiso para eliminar usuarios');
    });
  });
});