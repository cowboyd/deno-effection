// deno-lint-ignore-file no-explicit-any
export type K<T = any, R = any> = (value: T extends void ? void : T) => R;

export interface Proc<T = any> {
  [Symbol.iterator](): Iterator<Control, T, any>;
}

export type Control =
  {
    type: 'shift',
    block(k: K): Proc
  } |
  {
    type: 'reset',
    block(): Proc;
  }

export function* reset<T>(block: () => Proc): Proc<T> {
  return yield { type: 'reset', block };
}

export function* shift<T>(block: (k: K<T>) => Proc): Proc<T> {
  return yield { type: 'shift', block };
}

export function evaluate<T>(block: () => Proc<T>, done: K = v => v, value?: unknown): T {
  let prog = block()[Symbol.iterator]();
  let next = prog.next(value);
  if (next.done) {
    return done(next.value);
  } else {
    let control = next.value;
    let cont = ({ [Symbol.iterator]: () => prog });
    if (control.type === 'reset') {
      return evaluate(control.block, v => evaluate(() => cont, done, v));
    } else {
      let continued = false;
      let result: any;
      let k: K = value => {
        if (!continued) {
          continued = true;
          return result = evaluate(() => cont, v => v, value)
        } else {
          return result;
        }
      };
      return evaluate(() => control.block(k), done);
    }
  }
}

export function* race<T>(procs: Proc<T>[]): Proc<T> {
  return yield* shift(function*(k) {
    for (let proc of procs) {
      yield* reset(function*() {
        let result = yield* proc;
        k(result as T extends void ? void : T);
      })
    }
  });
}
