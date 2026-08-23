import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { loadLists } from './services/bringApi';
import {
  clearCredentials,
  clearSelectedList,
  loadCredentials,
  loadBringSyncEnabled,
  loadSelectedList,
  saveCredentials,
  saveBringSyncEnabled,
  saveSelectedList,
} from './services/storage';
import { BringList, Credentials } from './types';

type AuthValue = {
  credentials: Credentials | null;
  lists: BringList[];
  selectedList: BringList | null;
  initializing: boolean;
  bringSyncEnabled: boolean;
  setBringSyncEnabled: (enabled: boolean) => Promise<void>;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => Promise<void>;
  selectList: (list: BringList) => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  credentials: null,
  lists: [],
  selectedList: null,
  initializing: true,
  bringSyncEnabled: false,
  setBringSyncEnabled: async () => {},
  login: async () => {},
  logout: async () => {},
  selectList: async () => {},
});

export function AuthProvider({ children }: PropsWithChildren) {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [lists, setLists] = useState<BringList[]>([]);
  const [selectedList, setSelectedList] = useState<BringList | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [bringSyncEnabled, setBringSyncEnabledState] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([loadCredentials(), loadSelectedList(), loadBringSyncEnabled()])
      .then(([stored, storedList, syncEnabled]) => {
        if (!live) return;
        setCredentials(stored);
        setSelectedList(stored ? storedList : null);
        setBringSyncEnabledState(syncEnabled);
        setInitializing(false);
        if (!stored && storedList) clearSelectedList().catch(() => {});
        if (syncEnabled && stored) {
          loadLists(stored)
            .then((loadedLists) => live && setLists(loadedLists))
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!live) return;
        setCredentials(null);
        setLists([]);
        setSelectedList(null);
        setInitializing(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      credentials,
      lists,
      selectedList,
      initializing,
      bringSyncEnabled,
      setBringSyncEnabled: async (enabled) => {
        await saveBringSyncEnabled(enabled);
        setBringSyncEnabledState(enabled);
        if (!enabled) {
          setLists([]);
        } else if (credentials) {
          setLists(await loadLists(credentials));
        }
      },
      login: async (next) => {
        const normalized = { email: next.email.trim(), password: next.password };
        const loadedLists = await loadLists(normalized);
        await clearSelectedList();
        await saveCredentials(normalized);
        setSelectedList(null);
        setLists(loadedLists);
        setCredentials(normalized);
      },
      logout: async () => {
        await Promise.all([clearCredentials(), clearSelectedList()]);
        setSelectedList(null);
        setLists([]);
        setCredentials(null);
      },
      selectList: async (list) => {
        await saveSelectedList(list);
        setSelectedList(list);
      },
    }),
    [bringSyncEnabled, credentials, initializing, lists, selectedList],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
