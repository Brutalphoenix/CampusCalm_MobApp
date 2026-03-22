import { describe, it, expect } from 'vitest';
import { auth, db } from '../lib/firebase';

describe('Firebase Configuration', () => {
  it('should initialize auth', () => {
    expect(auth).toBeDefined();
    expect(auth.app.options.apiKey).toBe('AIzaSyAWDGgyWhUptH4yTaqsTMVBYR4cKMbQrFc');
  });

  it('should initialize firestore', () => {
    expect(db).toBeDefined();
    expect(db.type).toBe('firestore');
  });
});
