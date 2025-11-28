import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';

describe('Conversations API', () => {
  let agentToken: string;
  let testCompanyId: string;
  let testConversationId: string;
  let agentUserId: string;

  // ANTES de todas las pruebas: preparamos el entorno.
  beforeAll(async () => {
    // 1. Creamos una compañía de prueba
    const company = await prisma.company.create({
      data: { name: 'Conversation Test Co' },
    });
    testCompanyId = company.id;

    // 2. Asociamos nuestro usuario 'agent' a esta nueva compañía ANTES de hacer login
    await prisma.user.update({
      where: { email: 'agent@reply.com' },
      data: { companyId: testCompanyId },
    });

    // 3. Obtenemos un token para este usuario, que AHORA SÍ tendrá un companyId en su payload
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent@reply.com',
        password: 'password123',
      });
    agentToken = agentLoginRes.body.token;

    // Obtenemos el ID del usuario para usarlo como participante
    const agentUser = await prisma.user.findUnique({ where: { email: 'agent@reply.com' } });
    agentUserId = agentUser!.id;

    // 4. Creamos una conversación de prueba para nuestra compañía
    const conversation = await prisma.conversation.create({
      data: {
        companyId: testCompanyId,
        subject: 'Test Conversation Subject',
        participants: {
          connect: { id: agentUserId }, // Conectamos al agente como participante
        },
      },
    });
    testConversationId = conversation.id;
  });

  // DESPUÉS de todas las pruebas: limpiamos la base de datos.
  afterAll(async () => {
    // Desvinculamos al usuario de la compañía
    await prisma.user.update({
      where: { email: 'agent@reply.com' },
      data: { companyId: null },
    });
    // Eliminamos la compañía (esto debería eliminar la conversación en cascada)
    await prisma.company.delete({ where: { id: testCompanyId } }).catch(() => {});
    await prisma.$disconnect();
  });

  describe('GET /api/conversations', () => {
    it('debería obtener una lista de conversaciones para la compañía del usuario', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('success');
      expect(Array.isArray(response.body.data.conversations)).toBe(true);
      expect(response.body.results).toBe(1);
      expect(response.body.data.conversations[0].id).toBe(testConversationId);
    });
  });

  describe('GET /api/conversations/:id', () => {
    it('debería obtener una conversación específica si pertenece a la compañía del usuario', async () => {
      const response = await request(app)
        .get(`/api/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.conversation.id).toBe(testConversationId);
    });

    it('debería devolver un 404 si se intenta acceder a una conversación de otra compañía', async () => {
      // Creamos una conversación para otra compañía que no debería ser accesible
      const otherCompany = await prisma.company.create({ data: { name: 'Other Co' } });
      const otherConv = await prisma.conversation.create({ data: { companyId: otherCompany.id } });

      const response = await request(app)
        .get(`/api/conversations/${otherConv.id}`)
        .set('Authorization', `Bearer ${agentToken}`);

      expect(response.statusCode).toBe(404);

      // Limpieza
      await prisma.company.delete({ where: { id: otherCompany.id } });
    });
  });
});