import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';

describe('Posts API', () => {
  let agentToken: string;
  let createdPostId: string;

  // Antes de todas las pruebas, obtenemos un token de un usuario 'AGENT'
  beforeAll(async () => {
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent@reply.com',
        password: 'password123',
      });
    agentToken = agentLoginRes.body.token;
  });

  // Después de todas las pruebas, cerramos la conexión de Prisma
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Después de cada prueba, limpiamos el post creado
  afterEach(async () => {
    if (createdPostId) {
      await prisma.post.delete({ where: { id: createdPostId } }).catch(() => {});
      createdPostId = '';
    }
  });

  describe('POST /api/posts', () => {
    it('debería permitir a un usuario autenticado (AGENT) crear un nuevo post', async () => {
      const newPostData = { content: 'Este es un post de prueba desde Jest' };

      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${agentToken}`)
        .send(newPostData);

      expect(response.statusCode).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body.data.post.content).toBe(newPostData.content);
      createdPostId = response.body.data.post.id; // Guardamos para la limpieza
    });

    it('debería devolver un error de validación si el contenido está vacío', async () => {
      const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ content: '' }); // Enviamos contenido vacío

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('El contenido no puede estar vacío');
    });

    it('debería denegar la creación de un post si no se proporciona un token', async () => {
      const response = await request(app)
        .post('/api/posts')
        .send({ content: 'Contenido sin token' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/posts', () => {
    beforeAll(async () => {
      // Arrange: Creamos un post para asegurarnos de que la lista no esté vacía.
      const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
      const post = await prisma.post.create({
        data: {
          content: 'Post para la prueba de GET',
          authorId: agentUser!.id,
        },
      });
      createdPostId = post.id; // Usamos la variable global para que se limpie después
    });

    it('debería permitir a un usuario autenticado obtener la lista de posts', async () => {
      const response = await request(app)
        .get('/api/posts')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.posts)).toBe(true);
      expect(response.body.results).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/posts/:id', () => {
    let testPostId: string;

    // Antes de las pruebas de este bloque, creamos un post para tener un ID conocido.
    beforeAll(async () => {
      const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
      const post = await prisma.post.create({
        data: {
          content: 'Post para ser obtenido por ID',
          authorId: agentUser!.id,
        },
      });
      testPostId = post.id;
    });

    it('debería obtener un post específico por su ID', async () => {
      const response = await request(app)
        .get(`/api/posts/${testPostId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.post.id).toBe(testPostId);
      expect(response.body.data.post.content).toBe('Post para ser obtenido por ID');
    });

    it('debería devolver un error 404 si el post no existe', async () => {
      const response = await request(app)
        .get(`/api/posts/id_que_no_existe`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(404);
      expect(response.body.message).toContain('No se encontró un post con ese ID');
    });
  });

  describe('PATCH /api/posts/:id', () => {
    let testPostId: string;
    let authorId: string;

    // Antes de cada prueba, creamos un post para tener algo que actualizar.
    beforeEach(async () => {
      const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
      authorId = agentUser!.id;
      const post = await prisma.post.create({
        data: {
          content: 'Contenido original del post',
          authorId: authorId,
        },
      });
      testPostId = post.id;
    });

    it('debería permitir al autor del post actualizar su contenido', async () => {
      const updatedData = { content: 'Contenido actualizado del post' };

      const response = await request(app)
        .patch(`/api/posts/${testPostId}`)
        .set('Authorization', `Bearer ${agentToken}`) // Usamos el token del autor
        .send(updatedData);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.post.content).toBe(updatedData.content);
    });

    it('debería denegar la actualización si el usuario no es el autor', async () => {
      // Obtenemos un token de otro usuario (master) para intentar editar el post del agente.
      const masterLoginRes = await request(app).post('/api/auth/login').send({ email: 'master@reply.com', password: 'password123' });
      const masterToken = masterLoginRes.body.token;

      const response = await request(app)
        .patch(`/api/posts/${testPostId}`)
        .set('Authorization', `Bearer ${masterToken}`) // Usamos el token de un usuario diferente
        .send({ content: 'Intento de edición no autorizado' });

      expect(response.statusCode).toBe(403); // 403 Forbidden
      expect(response.body.message).toContain('No tienes permiso para editar este post');
    });

    it('debería devolver un 404 si se intenta actualizar un post que no existe', async () => {
      const response = await request(app)
        .patch('/api/posts/id_que_no_existe')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ content: 'Actualizando nada' });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/posts/:id', () => {
    let testPostId: string;
    let authorId: string;

    // Antes de cada prueba, creamos un post para tener algo que eliminar.
    beforeEach(async () => {
      const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
      authorId = agentUser!.id;
      const post = await prisma.post.create({
        data: {
          content: 'Post para ser eliminado',
          authorId: authorId,
        },
      });
      testPostId = post.id;
    });

    it('debería permitir al autor del post eliminarlo', async () => {
      const response = await request(app)
        .delete(`/api/posts/${testPostId}`)
        .set('Authorization', `Bearer ${agentToken}`); // Usamos el token del autor

      expect(response.statusCode).toBe(204); // 204 No Content

      // Verificamos que el post ya no existe en la base de datos
      const deletedPost = await prisma.post.findUnique({ where: { id: testPostId } });
      expect(deletedPost).toBeNull();
    });

    it('debería denegar la eliminación si el usuario no es el autor', async () => {
      // Obtenemos un token de otro usuario (master) para intentar eliminar el post del agente.
      const masterLoginRes = await request(app).post('/api/auth/login').send({ email: 'master@reply.com', password: 'password123' });
      const masterToken = masterLoginRes.body.token;

      const response = await request(app)
        .delete(`/api/posts/${testPostId}`)
        .set('Authorization', `Bearer ${masterToken}`); // Usamos el token de un usuario diferente

      expect(response.statusCode).toBe(403); // 403 Forbidden
      expect(response.body.message).toContain('No tienes permiso para eliminar este post');
    });
  });
});