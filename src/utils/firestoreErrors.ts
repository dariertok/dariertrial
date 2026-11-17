import { auth, FIREBASE_CONSOLE_DB_URL } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function formatFirebaseErrorForUser(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes('Quota exceeded')) {
    return `Przekroczono dzienny darmowy limit operacji bazy danych Firestore (resetuje się jutro). Szczegóły planu: ${FIREBASE_CONSOLE_DB_URL}`;
  }
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'Okno logowania Google zostało zamknięte przed ukończeniem.';
  }
  if (raw.includes('auth/popup-blocked')) {
    return 'Przeglądarka zablokowała okno logowania Google. Zezwól na wyskakujące okna dla tej strony.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'Domena aplikacji nie jest jeszcze autoryzowana w Firebase Auth.';
  }
  if (raw.includes('Missing or insufficient permissions')) {
    return 'Brak uprawnień do zapisu lub odczytu danych w chmurze. Upewnij się, że jesteś zalogowany zweryfikowanym kontem Google.';
  }
  if (raw.includes('client is offline')) {
    return 'Brak połączenia z chmurą — zmiany zapisano lokalnie i możesz pobrać kopię do pliku.';
  }
  return raw;
}
