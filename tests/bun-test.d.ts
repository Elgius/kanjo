declare module "bun:test" {
  type TestBody = () => void | Promise<void>;
  type Suite = (name: string, body: TestBody, timeout?: number) => void;

  export const describe: Suite & { skip: Suite };
  export const test: Suite & { skip: Suite };
  export function beforeAll(body: TestBody): void;
  export function afterAll(body: TestBody): void;
  export const mock: {
    module(specifier: string, factory: () => unknown): void;
  };

  type Matchers = {
    rejects: Matchers;
    toBe(expected: unknown): void;
    toBeNull(): void;
    toHaveLength(expected: number): void;
    toThrow(expected?: string | RegExp): void;
  };

  export function expect(value: unknown): Matchers;
}
