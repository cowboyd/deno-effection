import { assertEquals } from './asserts.ts';
import { run, operation, Future } from '../mod.ts';
const { test } = Deno;

test("operators can delegate to a low-level operation", async () => {
  let result = await run({
    *[operation]() {
      return "hello";
    }
  });

  assertEquals(result, "hello");
});

test("future operators", async  () => {
  assertEquals(await run({
    [operation]: Future.resolve("hello")
  }), "hello");
})
