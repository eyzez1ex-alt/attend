import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'
import { getAuth, type Auth } from 'firebase/auth'
import { getDataConnect, type DataConnect } from 'firebase/data-connect'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId)
export const firebaseApp: FirebaseApp | null = firebaseConfigured
  ? getApps().find(app => app.name === '[DEFAULT]') ?? initializeApp(config)
  : null
export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null

/** Analytics is optional and initializes only in supported browser environments. */
export const firebaseAnalytics: Promise<Analytics | null> = firebaseApp && config.measurementId
  ? isSupported().then(supported => supported ? getAnalytics(firebaseApp) : null).catch(() => null)
  : Promise.resolve(null)

const dataConnectConfig = {
  service: import.meta.env.VITE_DATACONNECT_SERVICE?.trim() ?? '',
  location: import.meta.env.VITE_DATACONNECT_LOCATION?.trim() ?? '',
  connector: import.meta.env.VITE_DATACONNECT_CONNECTOR?.trim() ?? '',
}

export const dataConnectConfigured = Boolean(
  firebaseApp && dataConnectConfig.service && dataConnectConfig.location && dataConnectConfig.connector,
)

/** Returns the configured SQL Connect client, or a clear setup error. */
export function getAttendanceDataConnect(): DataConnect {
  if (!firebaseApp) throw new Error('إعداد Firebase غير مكتمل. راجع ملف .env.local.')
  if (!dataConnectConfigured) {
    throw new Error('خدمة Firebase SQL Connect غير مهيأة بعد. أضف اسم الخدمة والمنطقة والموصل إلى .env.local.')
  }
  return getDataConnect(dataConnectConfig)
}
