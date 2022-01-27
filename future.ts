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

  return evaluate<NewFuture<T>>(function* () {
    let produce = yield* reset<K<Result<T>, void>>(function* () {
      result = yield* shift<Result<T>>(function* (k) {
        return k;
      });
      for (let notify = watchers.shift(); notify; notify = watchers.shift()) {
        if (notify) {
          notify(result);
        }
      }
    });

    let proc: Proc<Result<T>> = {
      *[Symbol.iterator]() {
        if (result) {
          return result;
        } else {
          return yield* shift<Result<T>>(function* (k) {
            watchers.push(k);
          });
        }
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
export function resolve<T>(): Future<T>;
export function resolve<T>(...values: T extends undefined ? [] : [T]): Future<T> {
  let { produce, future } = createFuture<T>();
  let [value] = values;
  produce({ type: 'value', value: value as T });
  return future;
}

export const Future = {
  resolve
}
// export function* createDestiny<T>(): Prog<NewDestiny<T>> {
//   let outcome: Outcome<T>;
//   let watchers: Continuation<Outcome<T>>[] = [];

//   let fulfill = yield* reset<Continuation<Outcome<T>>>(function*() {
//     outcome = yield* shift<Outcome<T>>(function*(k) { return k; });

//     for (let k = watchers.shift(); k; k = watchers.shift()) {
//       if (!!k) {
//         k(outcome);
//       }
//     }
//   });

//   let destiny: Destiny<T> = {
//     *[Symbol.iterator]() {
//       if (outcome) {
//         return outcome;
//       } else {
//         return yield* shift<Outcome<T>>(function*(k) { watchers.push(k); });
//       }
//     }
//   }

//   return {
//     destiny,
//     fulfill,
//     *[Symbol.iterator]() { return yield* destiny; }
//   };
// }
