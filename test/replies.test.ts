import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';

describe('Replies API', () => {
  let agentToken: string;
  let testPostId: string;
  let authorId: string;

  // ANTES de todas las pruebas: obtenemos un token y creamos un post al que responder.
  beforeAll(async () => {
    // Obtenemos el token del Agente
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent@reply.com',
        password: 'password123',
      });
    agentToken = agentLoginRes.body.token;

    // Obtenemos el ID del usuario para asociarlo al post
    const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
    authorId = agentUser!.id;

    // Creamos un post de prueba
    const post = await prisma.post.create({
      data: {
        content: 'Este es un post para probar las respuestas',
        authorId: authorId,
      },
    });
    testPostId = post.id;
  });

  // DESPUÉS de todas las pruebas: limpiamos el post creado y desconectamos Prisma.
  afterAll(async () => {
    if (testPostId) {
      await prisma.post.delete({ where: { id: testPostId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  describe('POST /api/replies', () => {
    let createdReplyId: string;

    // Limpiamos la respuesta creada después de cada prueba
    afterEach(async () => {
      if (createdReplyId) {
        await prisma.reply.delete({ where: { id: createdReplyId } }).catch(() => {});
        createdReplyId = '';
      }
    });

    it('debería permitir a un usuario autenticado crear una nueva respuesta a un post', async () => {
      const newReplyData = {
        content: 'Esta es una respuesta de prueba desde Jest',
        postId: testPostId,
      };

      const response = await request(app)
        .post('/api/replies')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(newReplyData);

      expect(response.statusCode).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.reply.content).toBe(newReplyData.content);
      expect(response.body.data.reply.postId).toBe(testPostId);
      createdReplyId = response.body.data.reply.id; // Guardamos para la limpieza
    });

    it('debería devolver un error de validación si falta el postId', async () => {
      const invalidReplyData = {
        content: 'Respuesta sin post ID',
      };

      const response = await request(app)
        .post('/api/replies')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(invalidReplyData);

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('El ID del post es requerido');
    });
  });

  describe('GET /api/replies/post/:postId', () => {
    // Antes de esta prueba, creamos un par de respuestas para asegurarnos de que hay datos para listar.
    beforeAll(async () => {
      await prisma.reply.createMany({
        data: [
          {
            content: 'Primera respuesta de prueba para GET',
            postId: testPostId,
            authorId: authorId,
          },
          {
            content: 'Segunda respuesta de prueba para GET',
            postId: testPostId,
            authorId: authorId,
          },
        ],
      });
    });

    it('debería obtener todas las respuestas para un post específico', async () => {
      const response = await request(app)
        .get(`/api/replies/post/${testPostId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.replies)).toBe(true);
      expect(response.body.results).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PATCH /api/replies/:id', () => {
    let testReplyId: string;

    beforeEach(async () => {
      const reply = await prisma.reply.create({
        data: {
          content: 'Respuesta original para actualizar',
          postId: testPostId,
          authorId: authorId,
        },
      });
      testReplyId = reply.id;
    });

    afterEach(async () => {
      if (testReplyId) {
        await prisma.reply.delete({ where: { id: testReplyId } }).catch(() => {});
      }
    });

    it('debería permitir al autor de la respuesta actualizarla', async () => {
      const updatedData = { content: 'Contenido de respuesta actualizado' };

      const response = await request(app)
        .patch(`/api/replies/${testReplyId}`)
        .set('Authorization', `Bearer ${agentToken}`)
        .send(updatedData);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.reply.content).toBe(updatedData.content);
    });

    it('debería denegar la actualización si el usuario no es el autor', async () => {
      const masterLoginRes = await request(app).post('/api/auth/login').send({ email: 'master@reply.com', password: 'password123' });
      const masterToken = masterLoginRes.body.token;

      const response = await request(app)
        .patch(`/api/replies/${testReplyId}`)
        .set('Authorization', `Bearer ${masterToken}`)
        .send({ content: 'Intento de edición no autorizado' });

      expect(response.statusCode).toBe(403);
      expect(response.body.message).toContain('No tienes permiso para editar esta respuesta');
    });
  });

  describe('DELETE /api/replies/:id', () => {
    let testReplyId: string;

    beforeEach(async () => {
      const reply = await prisma.reply.create({
        data: {
          content: 'Respuesta para ser eliminada',
          postId: testPostId,
          authorId: authorId,
        },
      });
      testReplyId = reply.id;
    });

    it('debería permitir al autor de la respuesta eliminarla', async () => {
      const response = await request(app)
        .delete(`/api/replies/${testReplyId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(204);

      const deletedReply = await prisma.reply.findUnique({ where: { id: testReplyId } });
      expect(deletedReply).toBeNull();
    });
  });
});