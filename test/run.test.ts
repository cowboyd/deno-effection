import {
  assertEquals,
  assertRejects,
} from "./asserts.ts";
import { createFuture, Future } from "../future.ts";
import { run } from "../scope.ts";
import { blowUp, createNumber, sleep, suspend } from "./helpers.ts";

const { test } = Deno;

test("run futures", async (t) => {
  await t.step("resolves with a value", async () => {
    assertEquals(5, await run(Future.resolve(5)));
  });
  await t.step("rejects with an error", () => {
    assertRejects(() => run(Future.reject(new Error("boom!"))));
  });

  await t.step("rejects with a halt", () => {
    assertRejects(() => run(Future.halt()), Error, "halt");
  });
});

test("can compose multiple operations", async () => {
  assertEquals(
    await run(function* () {
      let one: number = yield Future.resolve(12);
      let two: number = yield Future.resolve(55);
      return one + two;
    }),
    67,
  );
});

test("can compose generators", async () => {
  assertEquals(
    await run(function* () {
      let one: number = yield createNumber(12);
      let two: number = yield createNumber(55);
      return one + two;
    }),
    67,
  );
});

test("con run generators with a yield ", async () => {
  assertEquals(
    await run(function* () {
      yield sleep(1);
      return "hi";
    }),
    "hi",
  );
});

test("rejects generator if subtask promise fails", async () => {
  await assertRejects(
    () =>
      run(function* () {
        let one: number = yield createNumber(12);

        let two: number = yield blowUp();
        return one + two;
      }),
    Error,
    "boom",
  );
});

test("interrupts a running generator", async () => {
  let didFinally = false;
  let task = run(function* () {
    try {
      yield suspend();
    } finally {
      didFinally = true;
    }
  });
  await task.halt();

  assertEquals(didFinally, true);

  await assertRejects(() => task, Error, "halt");
});

test("rejects generator if generator creation fails", async () => {
  await assertRejects(() =>
    run(function () {
      throw new Error("boom");
    })
  );
});

test('can recover from errors in Future', async () => {
  let error = new Error('boom');
  let task = run(function*() {
    let one: number = yield Future.resolve(12);
    let two: number;
    try {
      yield Future.reject(error);
      two = 9;
    // deno-lint-ignore no-unused-vars
    } catch(e) {
      // swallow error and yield in catch block
      two = yield Future.resolve(8);
    }
    let three: number = yield Future.resolve(55);
    return one + two + three;
  });
  assertEquals(await task, 75);
});

test('can recover from errors in operation', async () => {
  let task = run(function*() {
    let one: number = yield Future.resolve(12);
    let two: number;
    try {
      yield blowUp();
      two = 9;
    // deno-lint-ignore no-unused-vars
    } catch(e) {
      // swallow error and yield in catch block
      two = yield Future.resolve(8);
    }
    let three: number = yield Future.resolve(55);
    return one + two + three;
  });
  assertEquals(await task, 75);
});

test('can halt generator', async () => {
  let task = run(function*() {
    let one: number = yield Future.resolve(12);
    let two: number = yield suspend();
    return one + two;
  });

  await task.halt();

  await assertRejects(() => task, Error, 'halt');
});

// test('halts task when halted generator', async () => {
//   let child: Task<void>;
//   let task = run(function*() {
//     yield function*() {
//       child = yield spawn(suspend());
//       yield sleep(100);
//     };
//   });

//   task.halt();

//   await assertRejects(() => task, Error, 'halt');
//   await assertRejects(() => child, Error, 'halt');
// });

test('can suspend in finally block', async () => {
  let { future, resolve } = createFuture<number>();

  let task = run(function*() {
    try {
      yield suspend();
    } finally {
      yield sleep(10);
      resolve(123);
    }
  });

  await task.halt();

  assertEquals(await future, 123);
});

// test('can suspend in yielded finally block', async () => {
//   let things: string[] = [];

//   let task = run(function*() {
//     try {
//       yield function*() {
//         try {
//           yield suspend();
//         } finally {
//           yield sleep(5);
//           things.push("  first");
//         }
//       };
//     } finally {
//       things.push("second");
//     }
//   });

//   await task.halt();

//   assertEquals(things, ['first', 'second']);
// });

// it('can await halt', async () => {
//   let didRun = false;

//   let task = run(function*() {
//     try {
//       yield;
//     } finally {
//       yield Promise.resolve(1);
//       didRun = true;
//     }
//   });

//   await task.halt();

//   expect(didRun).toEqual(true);
//   expect(task.state).toEqual('halted');
// });

// it('can be halted while in the generator', async () => {
//   let { future, produce } = createFuture();
//   let task = run(function*(inner) {
//     inner.run(function*() {
//       yield sleep(2);
//       produce({ state: 'errored', error: new Error('boom') });
//     });
//     yield future;
//   });

//   await expect(task).rejects.toHaveProperty('message', 'boom');
//   expect(task.state).toEqual('errored');
// });

// it('can halt itself', async () => {
//   let task = run(function*(inner) {
//     inner.halt();
//   });

//   await expect(task).rejects.toHaveProperty('message', 'halted');
//   expect(task.state).toEqual('halted');
// });

// it('can halt itself between yield points', async () => {
//   let task = run(function*(inner) {
//     yield sleep(1);

//     inner.run(function*() {
//       inner.halt();
//     });

//     yield;
//   });

//   await expect(task).rejects.toHaveProperty('message', 'halted');
//   expect(task.state).toEqual('halted');
// });

// it('can delay halt if child fails', async () => {
//   let didRun = false;
//   let task = run(function*(inner) {
//     inner.run(function* willBoom() {
//       yield sleep(5);
//       throw new Error('boom');
//     });
//     try {
//       yield;
//     } finally {
//       yield sleep(20);
//       didRun = true;
//     }
//   });

//   await run(sleep(10));

//   expect(task.state).toEqual('erroring');

//   await expect(task).rejects.toHaveProperty('message', 'boom');
//   expect(didRun).toEqual(true);
// });

// it('can throw error when child blows up', async () => {
//   let task = run(function*(inner) {
//     inner.run(function* willBoom() {
//       yield sleep(5);
//       throw new Error('boom');
//     });
//     try {
//       yield;
//     } finally {
//       throw new Error('bang');
//     }
//   });

//   await expect(task).rejects.toHaveProperty('message', 'bang');
// });

// it('can throw error when yield point is not a valid operation', async () => {
//   let task = run(function*() {
//     yield "I am not an operation" as unknown as Operation<unknown>;
//   });

//   await expect(task).rejects.toHaveProperty('message', 'unkown type of operation: I am not an operation');
// });
