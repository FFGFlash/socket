declare type Require<T, K extends keyof T> = T & { [P in K]-?: T[P] }
declare type ConstantArrayValue<T extends ReadonlyArray<unknown>> = T extends ReadonlyArray<infer ElementType> ? ElementType : never
declare module 'wtf-8'
declare module 'xmlhttprequest-ssl'
declare namespace globalThis {
  var ___eio: any[]
}
