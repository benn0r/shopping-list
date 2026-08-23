const PREFIX = 'shopping-list-e2e-secure:';

function browserTestStorage() {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (process.env.EXPO_PUBLIC_E2E !== '1' || !loopbackHosts.has(globalThis.location.hostname)) {
    throw new Error('Secure credential storage is unavailable on the web build.');
  }
  return globalThis.sessionStorage;
}

export async function setItemAsync(key: string, value: string) {
  browserTestStorage().setItem(`${PREFIX}${key}`, value);
}

export async function getItemAsync(key: string) {
  return browserTestStorage().getItem(`${PREFIX}${key}`);
}

export async function deleteItemAsync(key: string) {
  browserTestStorage().removeItem(`${PREFIX}${key}`);
}
