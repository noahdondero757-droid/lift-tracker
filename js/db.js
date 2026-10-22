// Tiny IndexedDB wrapper: a "workouts" store (keyed by id) and a "kv" store for everything else.

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open("lift-tracker", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("workouts")) db.createObjectStore("workouts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), s = tx.objectStore(store);
    const req = fn(s);
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const allWorkouts = () => run("workouts", "readonly", s => s.getAll());
export const putWorkout = w => run("workouts", "readwrite", s => s.put(w));
export const delWorkout = id => run("workouts", "readwrite", s => s.delete(id));
export const putWorkouts = ws => run("workouts", "readwrite", s => { for (const w of ws) s.put(w); });
export const kvGet = k => run("kv", "readonly", s => s.get(k));
export const kvSet = (k, v) => run("kv", "readwrite", s => v === undefined ? s.delete(k) : s.put(v, k));
