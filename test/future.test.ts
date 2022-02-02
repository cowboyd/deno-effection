import { assertEquals } from "https://deno.land/std@0.123.0/testing/asserts.ts";
import { createFuture, Result } from '../future.ts';
import { evaluate } from '../continuation.ts';

Deno.test("`Future`", async (t) => {
  await t.step("resolves synchronously", () => {
    let { future, resolve } = createFuture<string>();
    let result: Result<string> | undefined;
    evaluate(function*() {
      result = yield* future;
    })
    resolve('hello');
    assertEquals(result, { type: 'value', value: 'hello' });
  })

  await t.step("resolves in order of waiting", () => {
    let { future, resolve } = createFuture<void>();
    let results = [] as string[];
    evaluate(function*() {
      yield* future;
      results.push('one');
    })
    evaluate(function*() {
      yield* future;
      results.push('two');
    });
    resolve();
    assertEquals(results, ['one', 'two']);
  });

  await t.step("resolves immediately if state already known", () => {
    let { future, resolve } = createFuture<string>();
    resolve('hello');

    let result: Result<string> | undefined;
    evaluate(function*() {
      result = yield* future;
    })
    assertEquals(result, { type: 'value', value: 'hello' });
  });

  await t.step("with multiple productions", async (t) => {
    await t.step("can only be resolved to one value", () => {
      let { future, resolve } = createFuture<string>();
      let results = [] as Result<string>[];
      evaluate(function*() {
        results.push(yield* future);
      });
      resolve('hello');
      assertEquals([{ type: 'value', value: 'hello'}], results);

      results = [];
      resolve('world');
      evaluate(function*() {
        results.push(yield* future);
      });
      assertEquals([{ type: 'value', value: 'hello'}], results);
    });

    await t.step("cannot resolve after being rejected", () => {
      let { future, resolve, reject } = createFuture<string>();
      let results = [] as Result<string>[];
      evaluate(function*() {
        results.push(yield* future);
      });
      let error = new Error('boom!');
      reject(error);
      resolve('hello');
      assertEquals([{ type: 'error', error }], results);
    });

    await t.step("cannot be rejected after being resolved", () => {
      let { future, resolve, reject } = createFuture<string>();
      let results = [] as Result<string>[];
      evaluate(function*() {
        results.push(yield* future);
      });
      resolve('hello');
      reject(new Error('boom!'));
      assertEquals([{ type: 'value', value: 'hello'}], results);
    });
  });
});
