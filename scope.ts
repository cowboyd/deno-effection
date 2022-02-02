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

export const root = createScope();

export function run<T>(operation: Operation<T>, scope: Scope = root): Task<T> {
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
        let getNext = () => operation.next();
        while (true) {
          try {
            let next = getNext();

            if (next.done) {
              produce({ type: 'value', value: next.value });
            } else {
              let child = createScope(scope);
              let yieldingTo = run(next.value, child);
              let result = yield* race([done(scope), yieldingTo]);
              yield* destroy(child);
              if (result.type === 'value') {
                let { value } = result;
                getNext = () => operation.next(value);
              } else if (result.type === 'error') {
                let { error } = result;
                getNext = () => operation.throw(error);
              } else {
                getNext = () => operation.return(undefined as unknown as T);
              }
            }
          } catch (error) {
            return yield* raise(error, scope);
          }
        }
      });

    }

    return { ...future, halt };
  });
}

function createScope(_parent?: Scope) {
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

export function link(_task: Task<unknown>, _scope: Scope): void {

}

function* raise(_error: Error, _scope: Scope): Proc<void> {

}

export function destroy(_scope: Scope): Future<void> {
  return Future.resolve();
}

function isFuture<T>(operation: Operation<T>): operation is Future<T> {
  return typeof (operation as Future<unknown>)[Symbol.iterator] === `function`;
}
