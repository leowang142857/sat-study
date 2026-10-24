import type { Mistake, Word } from './types'

const DB_NAME = 'sat-study'
const DB_VERSION = 1
export type StoreName = 'mistakes' | 'words'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('mistakes')) db.createObjectStore('mistakes', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const db = {
  getAll<T extends Mistake | Word>(store: StoreName) {
    return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
  },
  put(store: StoreName, value: Mistake | Word) {
    return run(store, 'readwrite', (s) => s.put(value))
  },
  putMany(store: StoreName, values: (Mistake | Word)[]) {
    return run(store, 'readwrite', (s) => {
      values.forEach((v) => s.put(v))
    })
  },
  delete(store: StoreName, id: string) {
    return run(store, 'readwrite', (s) => s.delete(id))
  },
  clear(store: StoreName) {
    return run(store, 'readwrite', (s) => s.clear())
  },
}

export function uid(): string {
  return crypto.randomUUID()
}
