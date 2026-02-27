/**
 * 🏗️ SERVICE CONTAINER (Lightweight DI)
 *
 * Manual, type-safe Dependency Injection container.
 * Zero external dependencies — no reflect-metadata, no decorators.
 *
 * Design Philosophy:
 * - Explicit over magic: Dependencies are registered and resolved via typed tokens
 * - Lazy singletons: Services are only instantiated when first requested
 * - Factory pattern: Each service registers a factory function, not an instance
 * - Testable: Swap any service with a mock via container.register()
 *
 * Usage:
 *   // Register
 *   container.registerSingleton(TOKENS.SessionManager, () => new SessionManager(authProvider));
 *
 *   // Resolve
 *   const sessionManager = container.resolve(TOKENS.SessionManager);
 *
 *   // Test Override
 *   container.register(TOKENS.SessionManager, () => mockSessionManager);
 */

// ────────────────────────────────────────────────
// TOKEN TYPE (Branded type for compile-time safety)
// ────────────────────────────────────────────────

/**
 * InjectionToken is a branded string that carries the type information
 * of the service it represents. This makes container.resolve() type-safe.
 */
export interface InjectionToken<T> {
  readonly _brand: T;
  readonly name: string;
}

/**
 * Create a typed injection token.
 * @param name - Human-readable name for debugging
 */
export function createToken<T>(name: string): InjectionToken<T> {
  return { name } as InjectionToken<T>;
}

// ────────────────────────────────────────────────
// CONTAINER
// ────────────────────────────────────────────────

type Factory<T> = () => T;

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

class ServiceContainer {
  private registrations = new Map<string, Registration<unknown>>();

  /**
   * Register a transient service (new instance per resolve).
   */
  register<T>(token: InjectionToken<T>, factory: Factory<T>): void {
    this.registrations.set(token.name, {
      factory,
      singleton: false,
    });
  }

  /**
   * Register a singleton service (created once, cached).
   */
  registerSingleton<T>(token: InjectionToken<T>, factory: Factory<T>): void {
    this.registrations.set(token.name, {
      factory,
      singleton: true,
      instance: undefined,
    });
  }

  /**
   * Register an already-created instance as a singleton.
   */
  registerInstance<T>(token: InjectionToken<T>, instance: T): void {
    this.registrations.set(token.name, {
      factory: () => instance,
      singleton: true,
      instance,
    });
  }

  /**
   * Resolve a service by its token. Returns the typed instance.
   * @throws Error if token is not registered
   */
  resolve<T>(token: InjectionToken<T>): T {
    const reg = this.registrations.get(token.name) as
      | Registration<T>
      | undefined;

    if (!reg) {
      throw new Error(
        `[DI Container] No registration found for token: "${token.name}". ` +
          `Did you forget to call container.register() or container.registerSingleton()?`,
      );
    }

    if (reg.singleton) {
      if (reg.instance === undefined) {
        reg.instance = reg.factory();
      }
      return reg.instance;
    }

    return reg.factory();
  }

  /**
   * Check if a token is registered (useful for optional dependencies).
   */
  has<T>(token: InjectionToken<T>): boolean {
    return this.registrations.has(token.name);
  }

  /**
   * Reset a specific token (removes cached singleton instance).
   * Useful for testing.
   */
  reset<T>(token: InjectionToken<T>): void {
    const reg = this.registrations.get(token.name);
    if (reg) {
      reg.instance = undefined;
    }
  }

  /**
   * Clear all registrations. Only use in tests.
   */
  clearAll(): void {
    this.registrations.clear();
  }
}

// Global container instance
export const container = new ServiceContainer();
