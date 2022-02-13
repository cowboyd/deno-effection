import { evaluate, K, Proc, race, reset, shift } from "./continuation.ts";
import { createFuture, Future, Result } from "./future.ts";
import type {
  Context,
  EvalEvent,
  EvalEventListener,
  Operation,
  OperationFn,
  Operator,
  Scope,
  Task,
} from "./api.ts";
import { operation as $operation } from "./api.ts";

import { assert } from "https://deno.land/std@0.123.0/testing/asserts.ts";

export function run<T>(operation: Operation<T>, scope: Scope = root): Task<T> {
  return evaluate<Task<T>>(function* () {
    let { produce, future } = createFuture<T>();

    let halt = yield* reset<Task<T>["halt"]>(function* () {
      let result = yield* shift<Result<T>>(function* (settle) {
        return yield* createController(future, operation, settle, scope);
      });
      produce(result);
    });
    let task = {
      ...future,
      halt,
    };
    link(task, scope);
    return task;
  });
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

let ids = 0;

const contexts = new WeakMap<Scope, Context>();

export const root = newScope();

function newScope(parent?: Scope) {
  let scope: Scope = {
    *[Symbol.iterator]() {
      yield* shift(function* () {});
    },
  };
  contexts.set(scope, {
    id: ids++,
    parent,
    tasks: new Set(),
    children: new Set(),
    listeners: new Set(),
  })
  if (parent) {
    withinContext(parent, ({ children }) => children.add(scope));
  }
  return scope;
}

function createScope(parent: Scope = root) {
  return newScope(parent);
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

function* createController<T>(
  future: Future<T>,
  operation: Operation<T>,
  settle: K<Result<T>>,
  scope: Scope,
) {
  if (isOperator(operation)) {
    return yield* createOperatorController(future, operation, settle, scope);
  } else if (isFuture(operation)) {
    return yield* createFutureController(operation, settle);
  } else {
    return yield* createGeneratorController(future, operation, settle, scope);
  }
}

function isOperator<T>(operation: Operation<T>): operation is Operator<T> {
  return operation &&
    typeof (operation as Operator<T>)[$operation] !== "undefined";
}

function* createOperatorController<T>(
  future: Future<T>,
  operator: Operator<T>,
  settle: K<Result<T>>,
  scope: Scope,
): Proc<Task<T>["halt"]> {
  return yield* createController(future, operator[$operation], settle, scope);
}

function isFuture<T>(operation: Operation<T>): operation is Future<T> {
  return (operation as Future<unknown>)[Symbol.toStringTag] === `Future`;
}

function* createFutureController<T>(
  operation: Future<T>,
  settle: K<Result<T>>,
): Proc<Task<T>["halt"]> {
  yield* reset(function* () {
    settle(yield* operation);
  });

  return function halt() {
    settle({ type: "halt" });
    return Future.resolve();
  };
}

function* createGeneratorController<T>(
  future: Future<T>,
  operation: OperationFn<T>,
  settle: K<Result<T>>,
  scope: Scope,
): Proc<Task<T>["halt"]> {
  let generator = operation();
  let signal = {};
  let settleWith = (value: T) => settle({ type: "value", value });

  let interrupt = createFuture<typeof signal>();

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
            interrupt.future,
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

  return function halt() {
    settleWith = () => settle({ type: "halt" });

    //only interrupt once.
    interrupt.future = Future.suspend();
    interrupt.resolve(signal);

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
  };
}

export function addEvalEventListener(
  scope: Scope,
  listener: EvalEventListener,
): () => void {
  return withinContext(scope, ({ listeners }) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
}

function* dispatchEvalEvent(scope: Scope, event: EvalEvent): Proc<void> {
  for (let current of ancestryOf(scope)) {
    let { listeners } = withinContext(current, cx => cx);
    for (let listener of listeners) {
      if (listeners.has(listener)) {
        try {
          yield* listener(event);
        } catch (e) {
          console.warn(`not good: error '${e}' thrown in evaluation listener`);
        }
      }
    }
  }
}

function ancestryOf(scope: Scope): Scope[] {
  let scopes = [scope] as Scope[];
  while (true) {
    let parent = withinContext(scope, scope => scope.parent);
    if (parent) {
      scopes.push(parent);
    } else {
      return scopes;
    }
  }
}
