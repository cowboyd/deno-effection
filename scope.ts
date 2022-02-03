import { evaluate, Proc, race, reset, shift } from "./continuation.ts";
import { createFuture, Future } from "./future.ts";
import type { Operation, Result, Scope, Task } from "./api.ts";
import { assert } from "https://deno.land/std@0.123.0/testing/asserts.ts";

export function run<T>(operation: Operation<T>, scope: Scope = root): Task<T> {
  return evaluate<Task<T>>(function* () {
    let { produce, future } = createFuture<T>();

    let task = yield* reset<Task<T>>(function* () {
      let result = yield* shift<Result<T>>(function* (settle) {
        if (isFuture(operation)) {
          yield* reset(function* () {
            settle(yield* operation);
          });
          return {
            ...future,
            halt() {
              settle({ type: "halt" });
              return Future.resolve();
            },
          };
        } else {
          let generator = operation();
          let signal = {};
          let settleWith = (value: T) => settle({ type: "value", value });

          let { resolve: interrupt, future: signaled } = createFuture<
            typeof signal
          >();

          yield* reset(function* () {
            let getNext = () => generator.next();
            try {
              while (true) {
                let next = getNext();
                if (next.done) {
                  settleWith(next.value);
                  break;
                } else {
                  let yieldScope = createScope(scope);

                  let outcome = yield* race([
                    run(next.value, yieldScope),
                    signaled,
                  ]);

                  let teardown = yield* destroy(yieldScope);

                  if (teardown.type === "error") {
                    outcome = teardown;
                  }

                  if (outcome.type === "value") {
                    let { value } = outcome;
                    if (value === signal) {
                      getNext = () => generator.return({} as unknown as T);
                    } else {
                      getNext = () => generator.next(value);
                    }
                  } else if (outcome.type === "error") {
                    let { error } = outcome;
                    getNext = () => generator.throw(error);
                  } else {
                    getNext = () => generator.throw(new Error("halt"));
                  }
                }
              }
            } catch (error) {
              settle({ type: "error", error });
            }
          });

          return {
            ...future,
            halt() {
              settleWith = () => settle({ type: "halt" });
              signaled = Future.suspend();
              interrupt(signal);
              let { future: halted, resolve, reject } = createFuture<void>();
              evaluate(function* () {
                let outcome = yield* future;
                if (outcome.type === "error") {
                  reject(outcome.error);
                } else {
                  resolve();
                }
              });
              return halted;
            },
          };
        }
      });
      produce(result);
    });

    link(task, scope);
    return task;
  });
}

export interface Context {
  parent?: Scope;
  tasks: Set<Task<unknown>>;
  children: Set<Scope>;
}

function withinContext<R>(scope: Scope, fn: (context: Context) => R): R {
  let context = contexts.get(scope);
  assert(!!context, `critical: scope found without context data`);
  return fn(context);
}

function link(task: Task<unknown>, scope: Scope): void {
  withinContext(scope, ({ tasks }) => {
    tasks.add(task);
    evaluate(function* () {
      yield* task;
      tasks.delete(task);
    });
  });
}

const contexts = new WeakMap<Scope, Context>();

export const root: Scope = {
  *[Symbol.iterator]() {
    yield* shift(function* () {});
  },
};

contexts.set(root, { tasks: new Set(), children: new Set() });

function createScope(parent: Scope = root) {
  let scope: Scope = {
    *[Symbol.iterator]() {
      yield* shift(function* () {});
    },
  };

  contexts.set(scope, { parent, tasks: new Set(), children: new Set() });
  withinContext(parent, ({ children }) => children.add(scope));

  return scope;
}

function* destroy(scope: Scope): Proc<Result<void>> {
  let result: Result<void> = { type: "value", value: undefined };

  let { parent, tasks, children } = withinContext(scope, (cxt) => cxt);

  while (children.size > 0 || tasks.size > 0) {
    while (children.size > 0) {
      let order = [...children];
      for (let child = order.pop(); child; child = order.pop()) {
        let destruction = yield* destroy(child);
        if (destruction.type === "error") {
          result = destruction;
        }
      }
    }

    while (tasks.size > 0) {
      let order = [...tasks];
      for (let task = order.pop(); task; task = order.pop()) {
        let cancellation = yield* task.halt();
        if (cancellation.type === "error") {
          result = cancellation;
        }
      }
    }
  }

  if (parent) {
    withinContext(parent, ({ children }) => children.delete(scope));
  }

  return result;
}

function isFuture<T>(operation: Operation<T>): operation is Future<T> {
  return (operation as Future<unknown>)[Symbol.toStringTag] === `Future`;
}
