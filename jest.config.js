/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Indica a Jest que use el preset de ts-jest para transpilar TypeScript.
  preset: 'ts-jest',

  // El entorno de prueba que se usará. 'node' es ideal para backend.
  testEnvironment: 'node',

  // Especifica la carpeta raíz donde Jest buscará los archivos de prueba.
  roots: ['<rootDir>/test'],

  // Un mapa para que Jest entienda los alias de ruta que configuramos en tsconfig.json.
  moduleNameMapper: {
    // Mapea el alias @/ a la carpeta src/
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Limpia los mocks entre cada prueba para evitar interferencias.
  clearMocks: true,

  // Opcional: Habilita la recolección de cobertura de código.
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
};