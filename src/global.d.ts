declare type Require<T, K extends keyof T> = T & { [P in K]-?: T[P] }
declare type ConstantArrayValue<T extends ReadonlyArray<unknown>> = T extends ReadonlyArray<infer ElementType> ? ElementType : never
declare module 'wtf-8'
