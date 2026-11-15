import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { labelOf } from '../../lib/describe';
import { downloadJson } from '../../lib/download';
import {
  PANEL_PORT_NAME,
  type CapturedMessage,
  type PanelInbound,
  type PanelOutbound,
} from '../../lib/protocol';
import { EmptyState } from './EmptyState';
import { ColumnHeader, MessageList } from './MessageList';
import { MessageDetail, type DetailTab } from './MessageDetail';
import { Toolbar } from './Toolbar';
import { bucketOf, type DirectionBucket } from './types';

const MAX_ROWS = 2000;

type Bucket = Exclude<DirectionBucket, 'all'>;

interface Row {
  entry: CapturedMessage;
  haystack: string;
  bucket: Bucket;
}

function searchable(entry: CapturedMessage): string {
  let payload: string;
  if (typeof entry.data === 'string') {
    // JSON encoded as a string: search the readable text, not the escapes.
    payload = entry.data;
  } else {
    try {
      payload = JSON.stringify(entry.data) ?? '';
    } catch {
      payload = '';
    }
  }
  return `${entry.sender.origin} ${entry.sender.url ?? ''} ${entry.receiver.origin} ${labelOf(
    entry.data,
  )} ${payload}`.toLowerCase();
}

function toRows(entries: CapturedMessage[]): Row[] {
  return entries.map((entry) => ({
    entry,
    haystack: searchable(entry),
    bucket: bucketOf(entry.sender.kind),
  }));
}

type ThemeApi = {
  themeName?: string;
  onThemeChanged?: {
    addListener: (listener: (theme: string) => void) => void;
    removeListener: (listener: (theme: string) => void) => void;
  };
};

function themeApi(): ThemeApi | undefined {
  // `onThemeChanged` exists at runtime but is missing from some typings.
  return (chrome.devtools?.panels as unknown as ThemeApi | undefined) ?? undefined;
}

export function PanelApp() {
  const tabId = chrome.devtools?.inspectedWindow?.tabId ?? -1;

  const [rows, setRows] = useState<Row[]>([]);
  const [explicitSelectedId, setExplicitSelectedId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<DirectionBucket>('all');
  const [follow, setFollow] = useState(true);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const applyTheme = useCallback(() => {
    try {
      const api = themeApi();
      const dark = (api?.themeName ?? 'default') === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    } catch {
      // Not running inside DevTools (e.g. a plain page load during development).
    }
  }, []);

  useEffect(() => {
    applyTheme();
    const listener = () => applyTheme();
    const api = themeApi();
    try {
      api?.onThemeChanged?.addListener(listener);
    } catch {
      // No DevTools theme API available.
    }
    return () => {
      try {
        api?.onThemeChanged?.removeListener(listener);
      } catch {
        // Ignore.
      }
    };
  }, [applyTheme]);

  const handleInbound = useCallback((message: PanelInbound) => {
    switch (message.type) {
      case 'snapshot': {
        setRows(toRows(message.entries));
        // Anchor the selection on the newest message at load time, then leave it
        // alone: live traffic must not keep moving the detail pane.
        const last = message.entries[message.entries.length - 1];
        setExplicitSelectedId(last ? last.id : null);
        setRecording(message.recording);
        setMasterEnabled(message.enabled);
        return;
      }
      case 'entries': {
        setRows((previous) => {
          const next = previous.concat(toRows(message.entries));
          return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
        });
        return;
      }
      case 'cleared':
        setRows([]);
        setExplicitSelectedId(null);
        return;
      case 'recording':
        setRecording(message.recording);
        return;
    }
  }, []);

  useEffect(() => {
    if (tabId < 0) return;
    let disposed = false;
    let port: chrome.runtime.Port | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      try {
        port = chrome.runtime.connect({ name: PANEL_PORT_NAME });
      } catch {
        retry = setTimeout(connect, 500);
        return;
      }
      portRef.current = port;
      port.onMessage.addListener(handleInbound);
      port.onDisconnect.addListener(() => {
        // Reading lastError keeps the console clean when the worker is stopped.
        void chrome.runtime.lastError;
        portRef.current = null;
        if (!disposed) retry = setTimeout(connect, 300);
      });
      port.postMessage({ type: 'subscribe', tabId } satisfies PanelOutbound);
    };

    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      port?.disconnect();
    };
  }, [tabId, handleInbound]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (bucket === 'all' || row.bucket === bucket) &&
        (needle === '' || row.haystack.includes(needle)),
    );
  }, [rows, bucket, query]);

  const visibleEntries = useMemo(() => filtered.map((row) => row.entry), [filtered]);

  // The receiver that most messages land in is shown implicitly in the list;
  // repeating it on every row just eats horizontal space.
  const primaryReceiverOrigin = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.entry.receiver.origin, (counts.get(row.entry.receiver.origin) ?? 0) + 1);
    }
    let best = '';
    let bestCount = -1;
    for (const [origin, count] of counts) {
      if (count > bestCount) {
        best = origin;
        bestCount = count;
      }
    }
    return best;
  }, [rows]);

  // Selection is derived: an explicit pick wins while it is visible, otherwise
  // the first visible message is used. Never auto-follow the newest message —
  // that would move the detail pane while the user is reading it.
  const selectedId = useMemo(() => {
    if (
      explicitSelectedId !== null &&
      filtered.some((row) => row.entry.id === explicitSelectedId)
    ) {
      return explicitSelectedId;
    }
    const first = filtered[0];
    return first ? first.entry.id : null;
  }, [explicitSelectedId, filtered]);

  const selected = useMemo(
    () => rows.find((row) => row.entry.id === selectedId)?.entry ?? null,
    [rows, selectedId],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true;

      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === 'Escape') {
        if (document.activeElement === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        }
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (typing) return;
      if (visibleEntries.length === 0) return;
      event.preventDefault();
      const currentIndex = visibleEntries.findIndex((entry) => entry.id === selectedId);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const base = currentIndex === -1 ? visibleEntries.length - 1 : currentIndex;
      const nextIndex = Math.min(visibleEntries.length - 1, Math.max(0, base + delta));
      const next = visibleEntries[nextIndex];
      if (next) setExplicitSelectedId(next.id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleEntries, selectedId]);

  const post = (message: PanelOutbound) => portRef.current?.postMessage(message);

  const toggleRecording = () => {
    if (tabId < 0) return;
    post({ type: 'set-recording', tabId, enabled: !recording });
  };

  const clear = () => {
    if (tabId < 0) return;
    setRows([]);
    setExplicitSelectedId(null);
    post({ type: 'clear', tabId });
  };

  const exportFiltered = () => {
    if (visibleEntries.length === 0) return;
    downloadJson(`postmessage-${tabId}-${Date.now()}.json`, visibleEntries);
  };

  if (tabId < 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12px] text-muted">
        Open this panel from DevTools → postMessage.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <Toolbar
        query={query}
        onQueryChange={setQuery}
        searchRef={searchRef}
        bucket={bucket}
        onBucketChange={setBucket}
        recording={recording}
        onToggleRecording={toggleRecording}
        count={visibleEntries.length}
        total={rows.length}
        onClear={clear}
        onExport={exportFiltered}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-line">
          <ColumnHeader />
          {rows.length === 0 ? (
            <EmptyState
              recording={recording}
              enabled={masterEnabled}
              onStartRecording={toggleRecording}
            />
          ) : visibleEntries.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-[11px] text-muted">
              No messages match the current filter.
            </div>
          ) : (
            <MessageList
              entries={visibleEntries}
              selectedId={selectedId}
              primaryReceiverOrigin={primaryReceiverOrigin}
              onSelect={setExplicitSelectedId}
              follow={follow}
              onFollowChange={setFollow}
            />
          )}
        </div>
        <div className="flex w-[45%] min-w-[300px] max-w-[760px] flex-col">
          <MessageDetail
            key={selected?.id ?? 'none'}
            entry={selected}
            tab={detailTab}
            onTabChange={setDetailTab}
          />
        </div>
      </div>
    </div>
  );
}
