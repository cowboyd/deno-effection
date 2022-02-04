import type { Proc } from "./continuation.ts";
import type { Future } from "./future.ts";

// Futures
export type { Future, NewFuture, Result } from "./future.ts";

// Operations
// deno-lint-ignore no-explicit-any
export type OperationFn<T> = () => Generator<Operation<any>, T, any>;

declare global {
  const SymbolOperation: unique symbol;
}

export const operation: typeof SymbolOperation = Symbol.for(
  "Symbol.operation",
) as unknown as typeof SymbolOperation;

export interface Operator<T> extends Record<string | number | symbol, unknown> {
  [operation](): Operation<T>;
}

export type Operation<T> = Future<T> | OperationFn<T> | Operator<T>;

// Task
export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

// Scope
// deno-lint-ignore no-empty-interface
export interface Scope extends Proc<void> {
}

export interface Context {
  parent?: Scope;
  tasks: Set<Task<unknown>>;
  children: Set<Scope>;
}
