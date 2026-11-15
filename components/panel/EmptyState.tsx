import { Inbox, Radio } from 'lucide-react';

export interface EmptyStateProps {
  recording: boolean;
  enabled: boolean;
  onStartRecording: () => void;
}

export function EmptyState({ recording, enabled, onStartRecording }: EmptyStateProps) {
  const off = !recording || !enabled;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-raised text-muted">
        {off ? <Radio size={18} /> : <Inbox size={18} />}
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold">
          {off ? 'Recording is off for this tab' : 'No messages captured yet'}
        </p>
        <p className="max-w-md text-[11px] leading-relaxed text-muted">
          {off
            ? enabled
              ? 'Turn recording back on to capture postMessage traffic. The history already captured is kept.'
              : 'The extension is disabled everywhere. Enable it to start capturing again.'
            : 'Every message that any frame of this page receives will show up here — including iframes, srcdoc frames and messages sent before the page finished loading.'}
        </p>
      </div>
      {off && enabled ? (
        <button
          type="button"
          onClick={onStartRecording}
          className="rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:text-[#202124]"
        >
          Start recording
        </button>
      ) : null}
      {!off ? (
        <ul className="mt-1 space-y-1 text-left text-[11px] text-muted">
          <li>· Interact with the page and reload it if the traffic happens on load.</li>
          <li>· Filter with ⌘F; narrow by sender with the chips above.</li>
          <li>· History survives reloads, so you can open this panel after the bug.</li>
        </ul>
      ) : null}
    </div>
  );
}
