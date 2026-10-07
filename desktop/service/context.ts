import { AsyncLocalStorage } from "node:async_hooks"
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client"
export const LOCAL_AUTHOR_ID = "local-author"
export interface DatabaseContext { workspaceId: string; database: PrismaClient; transactionActive?: boolean }
const storage = new AsyncLocalStorage<DatabaseContext>()
export function runInDatabaseContext<T>(context: DatabaseContext, run: () => T): T {
  if (!context.workspaceId || !context.database) throw new Error("Invalid trusted database context")
  return storage.run(Object.freeze({ ...context }), run)
}
export function getDatabaseContext(): DatabaseContext {
  const current = storage.getStore()
  if (!current) throw new Error("No trusted database context")
  return current
}
export function createScopedClient(): PrismaClient {
  const delegates = new Map<PropertyKey, object>()
  const owners = new WeakMap<object, PrismaClient>()
  const checkedContext = () => {
    const context = getDatabaseContext()
    if (context.transactionActive) throw new Error("Use the supplied transaction; borrowing this database again would deadlock")
    return context
  }
  const remember = <T>(value: T, db: PrismaClient) => {
    if (value && typeof value === "object") owners.set(value, db)
    return value
  }
  return new Proxy({} as PrismaClient, { get(_target, key) {
    if (key === "then" || typeof key !== "string") return undefined
    if (key === "$transaction") return (run: ((tx: Prisma.TransactionClient) => Promise<unknown>) | Prisma.PrismaPromise<unknown>[], options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }) => {
      const context = checkedContext(); const db = context.database
      if (Array.isArray(run)) {
        if (run.some(query => owners.get(query) !== db)) throw new Error("Batch transaction contains a query from another database context")
        return db.$transaction(run, options)
      }
      if (typeof run !== "function") throw new Error("Invalid local transaction callback")
      return db.$transaction(tx => storage.run({ ...context, transactionActive: true }, () => run(tx)), options)
    }
    if (key.startsWith("$")) return (...args: unknown[]) => {
      const { database } = checkedContext()
      const value = Reflect.get(database, key)
      if (typeof value !== "function") throw new Error("Unsupported database operation")
      return remember(value.apply(database, args), database)
    }
    if (!delegates.has(key)) delegates.set(key, new Proxy({}, { get(_model, operation) {
      if (typeof operation !== "string" || operation === "then") return undefined
      return (...args: unknown[]) => {
        const { database } = checkedContext()
        const model = Reflect.get(database, key)
        const method = model && Reflect.get(model, operation)
        if (typeof method !== "function") throw new Error("Unsupported database model operation")
        return remember(method.apply(model, args), database)
      }
    } }))
    return delegates.get(key)
  } })
}
