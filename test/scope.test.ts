import { assertEquals, assertRejects } from "https://deno.land/std@0.123.0/testing/asserts.ts";
import { Future } from "../future.ts";
import { run } from '../scope.ts';

Deno.test("run", async (t) => {
  await t.step("futures", async (t) => {
    await t.step("resolves with a value", async () => {
      assertEquals(5, await run(Future.resolve(5)));
    })
    // await t.step("rejects with an error", () => {
    //   assertRejects(() => run(Future.reject(createError('boom!'))));
    // })
  });
});


function createError(message: string): Error {
  try {
    throw new Error(message);
  } catch (error) {
    return error;
  }
}
