import { evaluate, Proc, race, reset } from "./continuation.ts";
import { createFuture, Future, Result } from "./future.ts";

// deno-lint-ignore no-explicit-any
export type Operation<T> = Future<T> | Generator<Operation<any>, T, any>;

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

export interface Scope extends Proc<void> {
  spawn<T>(operation: Operation<T>): Operation<Task<T>>;
}

export function run<T>(operation: Operation<T>, scope: Scope): Task<T> {
  return evaluate(function* () {
    let { future, produce, halt } = createFuture<T>();

    if (isFuture(operation)) {
      yield* reset(function* () {
        let result = yield* race<Result<T>>([operation, done(scope), future]);
        produce(result);
      });

      return {
        ...future,
        halt: () => {
          halt();
          return Future.resolve();
        },
      };
    } else {
      yield* reset(function* () {
        let current: unknown;
        while (true) {
          let next = operation.next(current);
          if (next.done) {
            produce({ type: 'value', value: next.value });
          } else {
            let child = createScope(scope);
            let yieldingTo = run(next.value, child);
            let result = yield* race([done(scope), yieldingTo]);

          }
        }
      });

    }

    return { ...future, halt };
  });
}

function createScope(_parent: Scope) {
  let scope: Scope = {
    // deno-lint-ignore require-yield
    *spawn<T>(operation: Operation<T>) {
      return run(operation, scope);
    },
    *[Symbol.iterator]() {

    }
  }
  return scope;
}

function* done<T>(scope: Scope): Proc<Result<T>> {
  yield* scope;
  return { type: "halt" };
}

export declare function destroy(scope: Scope): Future<void>;

function isFuture<T>(operation: Operation<T>): operation is Future<T> {
  return typeof (operation as Future<unknown>)[Symbol.iterator] === `function`;
}
