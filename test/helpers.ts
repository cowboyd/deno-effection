import { Operation } from "../api.ts";
import { createFuture, Future } from "../future.ts";

export function sleep(time: number): Operation<void> {
  return function*() {
    let { future, resolve } = createFuture<void>();
    let timeoutId = setTimeout(() => {
      resolve();
    }, time);
    try {
      yield future;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // evaluate(function*() {
  //   yield* future;
  //   clearTimeout(timeoutId);
  // });

  // return future;
}

export function suspend(): Operation<void> {
  return Future.suspend();
}

export function createNumber(value: number) {
  return function*() {
    yield sleep(1);
    return value;
  }
}

export function blowUp(): Operation<void> {
  return function* () {
    yield sleep(1);
    throw new Error("boom");
  };
}
