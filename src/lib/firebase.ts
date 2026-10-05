import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  Auth,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch {
  try {
    authInstance = getAuth(app);
  } catch {
    authInstance = {} as Auth;
  }
}

export const auth = authInstance;
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

let firestoreInstance: Firestore;
try {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch {
  try {
    firestoreInstance = getFirestore(app);
  } catch {
    firestoreInstance = {} as Firestore;
  }
}

export const firestore = firestoreInstance;
export { browserPopupRedirectResolver, app };

