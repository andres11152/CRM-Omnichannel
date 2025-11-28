import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

describe('Onboarding API', () => {

  // Después de todas las pruebas, cerramos la conexión de Prisma
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/onboarding', () => {
    const testEmail = `onboarding-admin-${Date.now()}@test.com`;
    let createdCompanyId: string;
    let createdUserId: string;

    // Después de cada prueba, nos aseguramos de limpiar los datos creados
    afterEach(async () => {
      if (createdUserId) {
        await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
      }
      if (createdCompanyId) {
        await prisma.company.delete({ where: { id: createdCompanyId } }).catch(() => {});
      }
    });

    it('debería registrar una nueva compañía y su usuario administrador', async () => {
      const onboardingData = {
        companyName: 'Onboarding Test Inc.',
        adminEmail: testEmail,
        adminPassword: 'password123',
      };

      const response = await request(app)
        .post('/api/onboarding')
        .send(onboardingData);

      expect(response.statusCode).toBe(201);
      expect(response.body.status).toBe('success');
      expect(response.body).toHaveProperty('companyId');
      expect(response.body).toHaveProperty('adminId');

      // Guardamos los IDs para la limpieza
      createdCompanyId = response.body.companyId;
      createdUserId = response.body.adminId;

      // Verificamos en la base de datos que todo se creó correctamente
      const newCompany = await prisma.company.findUnique({ where: { id: createdCompanyId } });
      expect(newCompany).not.toBeNull();
      expect(newCompany?.name).toBe(onboardingData.companyName);

      const newAdmin = await prisma.user.findUnique({ where: { id: createdUserId } });
      expect(newAdmin).not.toBeNull();
      expect(newAdmin?.email).toBe(onboardingData.adminEmail);
      expect(newAdmin?.companyId).toBe(createdCompanyId);
      
      // Verificamos que la contraseña se guardó hasheada
      const isPasswordCorrect = await bcrypt.compare(onboardingData.adminPassword, newAdmin!.password);
      expect(isPasswordCorrect).toBe(true);
    });

    it('debería devolver un error 400 si faltan datos', async () => {
      const response = await request(app)
        .post('/api/onboarding')
        .send({ companyName: 'Incomplete Data' });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toContain('proporcione nombre de la compañía, email y contraseña');
    });
  });
});