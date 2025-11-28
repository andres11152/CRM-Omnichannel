import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';

describe('Admin API', () => {
  let masterToken: string;
  let agentToken: string;

  // Antes de que se ejecuten todas las pruebas en este archivo, obtenemos los tokens.
  beforeAll(async () => {
    // Obtenemos el token del Master Admin
    const masterLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'master@reply.com',
        password: 'password123',
      });
    masterToken = masterLoginRes.body.token;

    // Obtenemos el token de un Agente
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'agent@reply.com',
        password: 'password123',
      });
    agentToken = agentLoginRes.body.token;
  });

  // Cerramos la conexión de Prisma después de todas las pruebas.
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/admin/companies', () => {
    it('debería permitir el acceso a un super administrador y devolver una lista de compañías', async () => {
      // Act: Hacemos la petición con el token del master admin
      const response = await request(app)
        .get('/api/admin/companies')
        .set('Authorization', `Bearer ${masterToken}`);

      // Assert: Verificamos la respuesta
      expect(response.statusCode).toBe(200);
      // Verificamos que la respuesta sea un array (incluso si está vacío)
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('debería denegar el acceso si no se proporciona un token', async () => {
      // Act
      const response = await request(app)
        .get('/api/admin/companies');

      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.body.message).toContain('No has iniciado sesión');
    });

    it('debería denegar el acceso a un usuario con un rol incorrecto (ej. AGENT)', async () => {
      // Act: Hacemos la petición con el token del agente
      const response = await request(app)
        .get('/api/admin/companies')
        .set('Authorization', `Bearer ${agentToken}`);

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.body.message).toContain('requiere privilegios de Super Administrador');
    });
  });

  describe('POST /api/admin/companies', () => {
    // Guardamos el ID de la compañía creada para limpiarla después
    let createdCompanyId: string;

    afterEach(async () => {
      // Limpiamos la compañía creada después de cada prueba en este bloque
      if (createdCompanyId) {
        await prisma.company.delete({ where: { id: createdCompanyId } }).catch(() => {});
        createdCompanyId = '';
      }
    });

    it('debería permitir a un super administrador crear una nueva compañía', async () => {
      const newCompanyData = { name: 'Test Company From Jest' };

      const response = await request(app)
        .post('/api/admin/companies')
        .set('Authorization', `Bearer ${masterToken}`)
        .send(newCompanyData);

      expect(response.statusCode).toBe(201);
      expect(response.body.name).toBe(newCompanyData.name);
      expect(response.body).toHaveProperty('id');
      createdCompanyId = response.body.id; // Guardamos el ID para la limpieza
    });

    it('debería devolver un error de validación si el nombre no se proporciona', async () => {
      const response = await request(app)
        .post('/api/admin/companies')
        .set('Authorization', `Bearer ${masterToken}`)
        .send({}); // Enviamos un body vacío para forzar el error de validación

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('El nombre de la compañía es requerido');
    });
  });

  describe('PATCH /api/admin/companies/:companyId/status', () => {
    let testCompanyId: string;

    // Antes de cada prueba en este bloque, creamos una compañía para tener algo que actualizar.
    beforeEach(async () => {
      const company = await prisma.company.create({
        data: {
          name: 'Company to Update',
          status: 'TRIAL',
        },
      });
      testCompanyId = company.id;
    });

    // Después de cada prueba, limpiamos la compañía creada.
    afterEach(async () => {
      if (testCompanyId) {
        await prisma.company.delete({ where: { id: testCompanyId } }).catch(() => {});
      }
    });

    it('debería permitir a un super administrador actualizar el estado de una compañía a ACTIVE', async () => {
      const updateData = { status: 'ACTIVE' };

      const response = await request(app)
        .patch(`/api/admin/companies/${testCompanyId}/status`)
        .set('Authorization', `Bearer ${masterToken}`)
        .send(updateData);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('ACTIVE');
      expect(response.body.isActive).toBe(true);
    });

    it('debería devolver un error de validación si el estado proporcionado es inválido', async () => {
      const updateData = { status: 'INVALID_STATUS' };

      const response = await request(app)
        .patch(`/api/admin/companies/${testCompanyId}/status`)
        .set('Authorization', `Bearer ${masterToken}`)
        .send(updateData);

      expect(response.statusCode).toBe(400);
      // Verificamos que el mensaje de error de Zod para enums inválidos esté presente.
      // Esto es más robusto que comprobar el mensaje exacto.
      expect(response.body.message).toContain('Invalid enum value');
    });
  });

  describe('DELETE /api/admin/plans/:planId', () => {
    it('debería permitir a un super administrador eliminar un plan existente', async () => {
      const planId = 'plan-to-delete-for-success-case';
      try {
        // Arrange: Creamos un plan específicamente para esta prueba.
        await prisma.plan.create({
          data: {
            id: planId,
            name: 'Plan for Deletion Test',
            price: 99,
            config: {},
          },
        });

        // Act: Realizamos la petición de borrado.
        const response = await request(app)
          .delete(`/api/admin/plans/${planId}`)
          .set('Authorization', `Bearer ${masterToken}`);

        // Assert
        expect(response.statusCode).toBe(204);

        // Verificamos que el plan realmente fue eliminado de la base de datos
        const deletedPlan = await prisma.plan.findUnique({ where: { id: planId } });
        expect(deletedPlan).toBeNull();
      } finally {
        // Cleanup: Nos aseguramos de que el plan se elimine incluso si la prueba falla.
        await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
      }
    });

    it('debería devolver un error si se intenta eliminar un plan que no existe', async () => {
      const nonExistentPlanId = 'plan-que-no-existe';

      const response = await request(app)
        .delete(`/api/admin/plans/${nonExistentPlanId}`)
        .set('Authorization', `Bearer ${masterToken}`);

      // Ahora nuestro `globalErrorHandler` convierte el error P2025 de Prisma
      // en un error 404 Not Found, que es más apropiado.
      expect(response.statusCode).toBe(404);
      expect(response.body.message).toContain('Recurso no encontrado');
    });
  });

  describe('Plan Management', () => {
    const planId = 'test-plan-from-jest';

    // Limpiamos el plan después de las pruebas de este bloque
    afterAll(async () => {
      await prisma.plan.delete({ where: { id: planId } }).catch(() => {});
    });

    it('POST /api/admin/plans - debería crear un nuevo plan', async () => {
      const newPlanData = {
        id: planId,
        name: 'Test Plan from Jest',
        price: 19.99,
        config: { maxUsers: 10 },
      };

      const response = await request(app)
        .post('/api/admin/plans')
        .set('Authorization', `Bearer ${masterToken}`)
        .send(newPlanData);

      expect(response.statusCode).toBe(200); // O 201 si lo cambias
      expect(response.body.id).toBe(planId);
      expect(response.body.name).toBe(newPlanData.name);
    });

    it('GET /api/admin/plans - debería obtener una lista de planes que incluye el plan recién creado', async () => {
      const response = await request(app)
        .get('/api/admin/plans')
        .set('Authorization', `Bearer ${masterToken}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Verificamos que el plan que creamos en la prueba anterior esté en la lista
      expect(response.body.some((plan: any) => plan.id === planId)).toBe(true);
    });
  });

  describe('POST /api/admin/companies/:companyId/impersonate', () => {
    let testCompanyId: string;

    beforeAll(async () => {
      const company = await prisma.company.create({ data: { name: 'Impersonation Test Co' } });
      testCompanyId = company.id;
    });

    afterAll(async () => {
      await prisma.company.delete({ where: { id: testCompanyId } }).catch(() => {});
    });

    it('debería generar un token de suplantación para una compañía existente', async () => {
      const response = await request(app)
        .post(`/api/admin/companies/${testCompanyId}/impersonate`)
        .set('Authorization', `Bearer ${masterToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
    });
  });
});