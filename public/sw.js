const CACHE_NAME = 'classtime-cache-v1';
const FIREBASE_PROJECT_ID = "campuscalm-21e71";

// This is a simplified heartbeat that runs in the background
async function performBackgroundHeartbeat() {
  try {
    // 1. Get UID and Auth Token from Cache
    const uid = await getStoredMeta('uid');
    const token = await getStoredMeta('token');
    
    if (!uid) return;

    // 2. Check if monitoring is active via Firestore REST API
    const settingsUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/settings/monitoring`;
    const settingsResp = await fetch(settingsUrl);
    const settingsData = await settingsResp.json();
    
    const fields = settingsData.fields || {};
    const isActive = fields.active?.booleanValue ?? false;
    
    if (!isActive) return;

    // 3. Update 'activity' document to show student is "Online" in background
    const activityUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/activity/${uid}?updateMask.fieldPaths=lastActive&updateMask.fieldPaths=online`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Add auth token if we have one
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    await fetch(activityUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        fields: {
          lastActive: { timestampValue: new Date().toISOString() },
          online: { booleanValue: true }
        }
      })
    });
    
    console.log('[SW] Background heartbeat successful');
  } catch (err) {
    console.error('[SW] Background heartbeat failed:', err);
  }
}

async function getStoredMeta(key) {
  const cache = await caches.open('user-meta');
  const response = await cache.match(key);
  return response ? await response.text() : null;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'monitoring-heartbeat') {
    event.waitUntil(performBackgroundHeartbeat());
  }
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Listen for messages from main app
self.addEventListener('message', (event) => {
  if (!event.data) return;
  
  if (event.data.type === 'SET_UID') {
    event.waitUntil(
      caches.open('user-meta').then(cache => 
        cache.put('uid', new Response(event.data.uid))
      )
    );
  } else if (event.data.type === 'SET_AUTH_TOKEN') {
    event.waitUntil(
      caches.open('user-meta').then(cache => 
        cache.put('token', new Response(event.data.token))
      )
    );
  }
});
