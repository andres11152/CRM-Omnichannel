import request from 'supertest';
import { app } from '../server';
import { prisma } from '../prisma';
import Stripe from 'stripe';

// 1. Mock (simulamos) la librería completa de Stripe
jest.mock('stripe', () => {
  // Esto crea una clase simulada de Stripe
  const mStripe = {
    checkout: {
      sessions: { create: jest.fn() },
    },
    billingPortal: {
      sessions: { create: jest.fn() },
    },
  };
  return jest.fn(() => mStripe);
});

// 2. Creamos una versión "tipada" del mock para que TypeScript no se queje
const mockedStripe = new Stripe('test_key') as jest.Mocked<Stripe>;

describe('Payment API', () => {
  let agentToken: string;
  let testCompanyId: string;
  const stripeCustomerId = 'cus_test_12345';

  // ANTES de todas las pruebas: preparamos el entorno.
  beforeAll(async () => {
    // Creamos una compañía de prueba con un ID de cliente de Stripe
    const company = await prisma.company.create({
      data: {
        name: 'Payment Test Co',
        stripeCustomerId: stripeCustomerId,
      },
    });
    testCompanyId = company.id;

    // Asociamos nuestro usuario 'agent' a esta compañía
    await prisma.user.update({
      where: { email: 'agent@reply.com' },
      data: { companyId: testCompanyId },
    });

    // Obtenemos un token para este usuario
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'agent@reply.com', password: 'password123' });
    agentToken = agentLoginRes.body.token;
  });

  // DESPUÉS de todas las pruebas: limpiamos la base de datos.
  afterAll(async () => {
    await prisma.user.update({ where: { email: 'agent@reply.com' }, data: { companyId: null } });
    await prisma.company.delete({ where: { id: testCompanyId } }).catch(() => {});
    await prisma.$disconnect();
  });

  // Antes de cada prueba, limpiamos las implementaciones de los mocks
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/create-checkout-session', () => {
    it('debería crear una sesión de checkout de Stripe y devolver una URL', async () => {
      // 3. Arrange: Definimos la respuesta simulada de la API de Stripe
      const mockSession = { url: 'https://checkout.stripe.com/test_session' };
      // Hacemos un "casting" para que TypeScript sepa que es un mock de Jest
      (mockedStripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      // Act: Llamamos a nuestro endpoint
      const response = await request(app)
        .post('/api/create-checkout-session')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({ priceId: 'price_test_123' });

      // Assert: Verificamos la respuesta de nuestra API
      expect(response.statusCode).toBe(200);
      expect(response.body.url).toBe(mockSession.url);

      // Verificamos que nuestro código llamó a la función de Stripe con los datos correctos
      expect(mockedStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: stripeCustomerId,
          line_items: expect.any(Array),
        })
      );
    });
  });

  describe('POST /api/create-portal-session', () => {
    it('debería crear una sesión del portal de cliente de Stripe y devolver una URL', async () => {
      // Arrange: Definimos la respuesta simulada
      const mockPortalSession = { url: 'https://billing.stripe.com/test_portal' };
      // Hacemos un "casting" para que TypeScript sepa que es un mock de Jest
      (mockedStripe.billingPortal.sessions.create as jest.Mock).mockResolvedValue(mockPortalSession);

      // Act
      const response = await request(app)
        .post('/api/create-portal-session')
        .set('Authorization', `Bearer ${agentToken}`);

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body.url).toBe(mockPortalSession.url);
      expect(mockedStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: stripeCustomerId,
        return_url: expect.any(String),
      });
    });
  });
});