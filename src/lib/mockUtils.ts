// Utility placeholder - no external deps needed
export class BehaviorSubject<T> {
  private value: T;
  private listeners: Array<(val: T) => void> = [];
  constructor(initial: T) { this.value = initial; }
  subscribe(cb: (val: T) => void) {
    this.listeners.push(cb);
    cb(this.value);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }
  next(val: T) { this.value = val; this.listeners.forEach(cb => cb(val)); }
  getValue() { return this.value; }
}
