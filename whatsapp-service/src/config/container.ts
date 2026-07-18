export interface InjectionToken<T> {
  readonly _brand: T;
  readonly name: string;
}

export function createToken<T>(name: string): InjectionToken<T> {
  return { name } as InjectionToken<T>;
}

type Factory<T> = () => T;

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

class ServiceContainer {
  private registrations = new Map<string, Registration<unknown>>();

  register<T>(token: InjectionToken<T>, factory: Factory<T>): void {
    this.registrations.set(token.name, {
      factory,
      singleton: false,
    });
  }

  registerSingleton<T>(token: InjectionToken<T>, factory: Factory<T>): void {
    this.registrations.set(token.name, {
      factory,
      singleton: true,
      instance: undefined,
    });
  }

  registerInstance<T>(token: InjectionToken<T>, instance: T): void {
    this.registrations.set(token.name, {
      factory: () => instance,
      singleton: true,
      instance,
    });
  }

  resolve<T>(token: InjectionToken<T>): T {
    const reg = this.registrations.get(token.name) as Registration<T> | undefined;

    if (!reg) {
      throw new Error(
        `[DI Container] No registration found for token: "${token.name}".`
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

  has<T>(token: InjectionToken<T>): boolean {
    return this.registrations.has(token.name);
  }

  reset<T>(token: InjectionToken<T>): void {
    const reg = this.registrations.get(token.name);
    if (reg) {
      reg.instance = undefined;
    }
  }

  clearAll(): void {
    this.registrations.clear();
  }
}

export const container = new ServiceContainer();
