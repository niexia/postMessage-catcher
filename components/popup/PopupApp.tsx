import { Github, Monitor, Moon, Sun, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  type RuntimeRequest,
  type Settings,
} from '../../lib/protocol';
import { normalizeSettings } from '../../lib/storage';
import {
  applyTheme,
  mirrorTheme,
  nextTheme,
  normalizeTheme,
  themeLabel,
  type ThemeMode,
} from '../../lib/theme';
import { cn } from '../../lib/utils';

function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
  label,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-[10px] leading-tight text-muted" title={description}>
          {description}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

export function PopupApp() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [count, setCount] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const unsupportedRef = useRef(0);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEYS.settings, (stored) => {
      setSettings(normalizeSettings(stored[STORAGE_KEYS.settings]));
    });

    chrome.storage.local.get(STORAGE_KEYS.theme, (stored) => {
      const mode = normalizeTheme(stored[STORAGE_KEYS.theme]);
      setTheme(mode);
      mirrorTheme(mode);
      applyTheme(mode, document);
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (typeof tab?.id === 'number') setTabId(tab.id);
    });

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.settings]) {
        setSettings(normalizeSettings(changes[STORAGE_KEYS.settings]?.newValue));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const refresh = useCallback(() => {
    if (tabId === null) return;
    chrome.runtime.sendMessage(
      { type: 'pmc:get-state', tabId } satisfies RuntimeRequest,
      (response: unknown) => {
        void chrome.runtime.lastError;
        const state = response as { ok?: boolean; recording?: boolean; count?: number } | undefined;
        if (state?.ok) {
          unsupportedRef.current = 0;
          setRecording(Boolean(state.recording));
          setCount(state.count ?? 0);
        } else if (unsupportedRef.current < 2) {
          unsupportedRef.current += 1;
        }
      },
    );
  }, [tabId]);

  useEffect(() => {
    if (tabId === null) return;
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [refresh, tabId]);

  useEffect(() => {
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system', document);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const cycleTheme = () => {
    const next = nextTheme(theme);
    setTheme(next);
    mirrorTheme(next);
    applyTheme(next, document);
    chrome.storage.local.set({ [STORAGE_KEYS.theme]: next });
  };

  const toggleRecording = () => {
    if (tabId === null) return;
    const next = !recording;
    setRecording(next);
    chrome.runtime.sendMessage(
      { type: 'pmc:set-recording', tabId, enabled: next } satisfies RuntimeRequest,
      () => {
        void chrome.runtime.lastError;
      },
    );
  };

  const toggleMaster = () => {
    const next: Settings = { ...settings, enabled: !settings.enabled };
    setSettings(next);
    chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
    // Let the worker apply the change, then refresh the effective state instead
    // of waiting a full poll interval for the switch to catch up.
    window.setTimeout(refresh, 120);
  };

  const version = chrome.runtime.getManifest().version;
  const live = recording && settings.enabled;

  const recordingDescription = !settings.enabled
    ? 'Turn on “Capture on all sites” first'
    : !recording
      ? count > 0
        ? `Paused · ${count} kept`
        : 'Paused for this tab'
      : count > 0
        ? `Recording all frames · ${count} ${count === 1 ? 'msg' : 'msgs'}`
        : 'Recording all frames';

  return (
    <div className="flex w-full flex-col gap-2.5 p-3">
      <header className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors',
            live ? 'bg-accent' : 'bg-line',
          )}
        />
        <h1 className="text-[13px] font-semibold leading-none">postMessage-catcher</h1>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={cycleTheme}
            title={`Theme: ${themeLabel(theme)} — click to change`}
            aria-label={`Change theme (currently ${themeLabel(theme)})`}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {theme === 'light' ? (
              <Sun size={13} />
            ) : theme === 'dark' ? (
              <Moon size={13} />
            ) : (
              <Monitor size={13} />
            )}
          </button>
          <span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted">
            v{version}
          </span>
        </div>
      </header>

      <section className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-raised">
        <SettingRow
          title="Record this tab"
          description={recordingDescription}
          checked={live}
          onChange={toggleRecording}
          label="Record this tab"
          disabled={!settings.enabled || tabId === null}
        />
        <SettingRow
          title="Capture on all sites"
          description={settings.enabled ? 'On for every tab you open' : 'Off — nothing is captured'}
          checked={settings.enabled}
          onChange={toggleMaster}
          label="Capture on all sites"
        />
      </section>

      <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
        <Terminal size={12} className="mt-px shrink-0" />
        <span>
          Open <span className="font-medium text-ink">DevTools → postMessage</span> to inspect,
          filter and export the traffic.
        </span>
      </p>

      <footer className="flex items-center justify-between border-t border-line pt-2 text-[10px] text-muted">
        <a
          href="https://github.com/niexia/postMessage-catcher"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-ink"
        >
          <Github size={11} /> GitHub
        </a>
        <span>Local only · no network</span>
      </footer>
    </div>
  );
}
