importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js');

const CACHE = 'vufind-v2';
const ASSETS = [
  '/Smart-Lost-and-Found/',
  '/Smart-Lost-and-Found/index.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

const VU_ICON = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='36' fill='%231a3580'/><rect x='20' y='20' width='152' height='152' rx='24' fill='%23cc1414'/><text x='96' y='130' font-family='Arial' font-weight='900' font-size='90' fill='white' text-anchor='middle'>VU</text></svg>";

/* ── CACHE ── */
self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', e=>{
  if(e.request.url.includes('firebase') || e.request.url.includes('googleapis.com')){
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached) return cached;
      return fetch(e.request).then(res=>{
        if(res && res.status===200 && res.type==='basic'){
          const clone = res.clone();
          caches.open(CACHE).then(c=>c.put(e.request, clone));
        }
        return res;
      }).catch(()=>caches.match('/index.html'));
    })
  );
});

/* ── NOTIFICATION CLICK ── */
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      for(const c of list){
        if(c.url && c.focus) return c.focus();
      }
      return clients.openWindow('/Smart-Lost-and-Found/');
    })
  );
});

/* ── FIREBASE FIRESTORE LISTENER (runs in SW — survives app close) ── */
let db = null;
let unsubItems = null;
let swUserId = null;
let lastSeenAt = null;

function initFirebaseInSW(){
  if(db) return;
  try{
    if(!firebase.apps.length){
      firebase.initializeApp({
        apiKey: "AIzaSyB_hIRIfUfI0uivKKkRk8xno9TQwt0T4jM",
        authDomain: "lost-and-found-app-9d5d4.firebaseapp.com",
        projectId: "lost-and-found-app-9d5d4",
        storageBucket: "lost-and-found-app-9d5d4.firebasestorage.app",
        messagingSenderId: "334727118690",
        appId: "1:334727118690:web:6430baaf5ac60522cfb63b"
      });
    }
    db = firebase.firestore();
  } catch(e){ console.warn('[SW] Firebase init failed:', e); }
}

function startItemListener(){
  if(!db || unsubItems) return;
  // lastSeenAt defaults to now so we only notify about items posted AFTER login
  if(!lastSeenAt) lastSeenAt = new Date().toISOString();

  unsubItems = db.collection('items').onSnapshot(snap=>{
    snap.docChanges().forEach(change=>{
      if(change.type !== 'added') return;
      const item = { id: change.doc.id, ...change.doc.data() };

      // Skip items that were already there when we started listening
      if(!item.at || item.at <= lastSeenAt) return;
      // Skip items posted by this user (don't notify yourself)
      if(swUserId && item.byId === swUserId) return;
      // Only notify about lost/found pending items
      if(item.status !== 'pending') return;

      const isLost  = item.type === 'lost';
      const title   = isLost ? '🔴 New Lost Item Report' : '🟢 New Found Item Report';
      const body    = item.name + (item.loc ? ' — ' + item.loc : '');

      self.registration.showNotification(title, {
        body,
        icon: VU_ICON,
        badge: VU_ICON,
        tag: 'vufind-item-' + item.id,
        renotify: true,
        data: { itemId: item.id }
      });

      // Advance the cursor so we don't re-notify
      if(item.at > lastSeenAt) lastSeenAt = item.at;
    });
  }, err=>{ console.warn('[SW] Firestore listen error:', err); });
}

function stopItemListener(){
  if(unsubItems){ unsubItems(); unsubItems = null; }
}

/* ── RECEIVE MESSAGES FROM MAIN THREAD ── */
self.addEventListener('message', e=>{
  const { type, userId, seenAt } = e.data || {};

  if(type === 'USER_LOGIN'){
    swUserId   = userId  || null;
    lastSeenAt = seenAt  || new Date().toISOString();
    initFirebaseInSW();
    stopItemListener();
    startItemListener();
  }

  if(type === 'USER_LOGOUT'){
    swUserId   = null;
    lastSeenAt = null;
    stopItemListener();
  }
});
