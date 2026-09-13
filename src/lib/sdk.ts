import { TecSdk } from '@yasser172/tec-sdk';
import { getAccessToken, getStoredUser } from '@/lib-client/pi/pi-auth';

// NEW-A: the internal gateway URL must NEVER reach the browser. Any NEXT_PUBLIC_*
// is inlined into the client bundle, so this client-side sdk carries NO gateway URL.
// It is used only for local ops (auth helpers) and a legacy incomplete-payment
// fallback; every real gateway call goes through the server-only BFF
// (/api/bff/* → API_GATEWAY_URL). With no URL, any stray client→gateway call fails
// loudly rather than leaking/using an internal host.
const gatewayUrl = '';

export const sdk = new TecSdk({ gatewayUrl });

const getToken = (): string | null => getAccessToken();

const getUserId = (): string | null => {
  const user = getStoredUser() as { id?: string; uid?: string } | null;
  return user?.id ?? user?.uid ?? null;
};

export { getToken, getUserId };
export default sdk;
