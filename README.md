# effection.land

A PoC for Effection running on Deno


## synopsis

``` typescript
import { run } from './mod.ts';

let message = await run(function*() {
  return yield function*() {
    return "Hello World!"
  }
})

console.log(message) //=> Hello World!
```

## development
``` text
$ deno test
```
