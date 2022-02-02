import { evaluate, K, Proc, reset, shift } from "./continuation.ts";

export type Result<T> = {
  type: "value";
  value: T;
} | {
  type: "error";
  error: Error;
} | {
  type: "halt";
};

export interface Future<T> extends Promise<T>, Proc<Result<T>> {}

export interface NewFuture<T> {
  future: Future<T>;
  resolve: K<T>;
  reject: K<Error>;
  halt: K<void>;
  produce: K<Result<T>>;
}

export function createFuture<T>(): NewFuture<T> {
  let result: Result<T>;
  let watchers: K<Result<T>>[] = [];
  let notifying = false;

  function* notify() {
    if (notifying) {
      return;
    }
    notifying = true;
    try {
      for (let watcher = watchers.shift(); watcher; watcher = watchers.shift()) {
        watcher!(result);
      }
    } finally {
      notifying = false;
    }
  }

  return evaluate<NewFuture<T>>(function* () {
    let produce = yield* reset<K<Result<T>, void>>(function* () {
      result = yield* shift<Result<T>>(function* (k) {
        return k;
      });
      yield* notify();
    });

    let proc: Proc<Result<T>> = {
      *[Symbol.iterator]() {
        return yield* shift<Result<T>>(function* (k) {
          watchers.push(k);
          if (result) {
            yield* notify();
          }
        });
      },
    };

    let promise = new Promise<T>((resolve, reject) => {
      evaluate(function* () {
        let result = yield* proc;
        if (result.type === "value") {
          resolve(result.value);
        } else if (result.type === "error") {
          reject(result.error);
        } else {
          reject(new Error("halt"));
        }
      });
    });

    let future: Future<T> = {
      ...proc,
      then: (...args) => promise.then(...args),
      catch: (...args) => promise.catch(...args),
      finally: (...args) => promise.finally(...args),
      [Symbol.toStringTag]: "[object Future]",
    };

    return {
      future,
      produce,
      resolve: (value) => produce({ type: "value", value: value as T }),
      reject: (error) => produce({ type: "error", error }),
      halt: () => produce({ type: "halt" }),
    };
  });
}
export function resolve(): Future<void>;
export function resolve<T>(value: T): Future<T>;
export function resolve<T>(value?: T): Future<T> {
  let { produce, future } = createFuture<T>();
  produce({ type: 'value', value: value as T });
  return future;
}

export function halt(): Future<void> {
  let { produce, future } = createFuture<void>();
  produce({ type: 'halt' });
  return future;
}

export function reject(error: Error): Future<never> {
  let { produce, future } = createFuture<never>();
  produce({ type: 'error', error });
  return future;
}

export const Future = {
  resolve,
  reject,
  halt
}
