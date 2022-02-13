import type { Proc } from "./continuation.ts";
import type { Future } from "./future.ts";

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
  [operation]: Operation<T>;
}

export type Operation<T> = Future<T> | OperationFn<T> | Operator<T>;

// Task
export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

// Scope
// deno-lint-ignore no-empty-interface
export interface Scope extends Proc<void> {
  //spawn<T>(operation: Operation<T>): Task<T>;
}

export interface Context {
  id: number;
  parent?: Scope;
  tasks: Set<Task<unknown>>;
  children: Set<Scope>;
  listeners: Set<EvalEventListener>;
}

export interface EvalEventListener {
  (event: EvalEvent): Proc<void>;
}

export type EvalEventType =
  | "scopecreated"
  | "scopedestroying"
  | "scopedestroyed"
  | "tasklink"
  | "taskunlink"
  | "scoperaise"
  | "taskcreated"
  | "taskinterrupted"
  | "tasksettled"
  | "taskyield";

export interface EvalEvent {
  type: EvalEventType;
}

export interface ScopeEvent {
  type: "scopecreated" | "scopedestroying" | "scopedestroyed" | "scoperaise"
  scope: Scope;
  context: Context;
}
