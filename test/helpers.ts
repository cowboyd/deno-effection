import { createFuture, Future, Operation, operation } from "../mod.ts";

export function sleep(time: number): Operation<void> {
  return {
    name: "sleep",
    time,
    *[operation]() {
      let { future, resolve } = createFuture<void>();
      let timeoutId = setTimeout(() => {
        resolve();
      }, time);
      try {
        yield future;
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

export function suspend(): Operation<void> {
  return { name: "suspend", [operation]: Future.suspend() };
}

export function createNumber(value: number) {
  return {
    name: "createNumber",
    value,
    *[operation]() {
      yield sleep(1);
      return value;
    },
  };
}

export function blowUp(): Operation<void> {
  return {
    name: "blowUp",
    *[operation]() {
      yield sleep(1);
      throw new Error("boom");
    },
  };
}
