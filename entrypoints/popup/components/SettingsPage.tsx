import { useState, useEffect } from "react";
import type { Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { getSettings, updateSettings } from "@/lib/storage";
import { getEffectiveClientId } from "@/lib/slack";

interface Props {
  onBack: () => void;
}

const redirectUrl = typeof browser !== "undefined"
  ? browser.identity.getRedirectURL()
  : "";

export default function SettingsPage({ onBack }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const displayValue = settings.slackClientId || getEffectiveClientId();

  const handleClientIdChange = (value: string) => {
    setSettings((prev) => ({ ...prev, slackClientId: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    await updateSettings({ slackClientId: settings.slackClientId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          title="Back"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-gray-900">Settings</h1>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="slack-client-id" className="block text-sm font-medium text-gray-700 mb-1">
            Slack Client ID
          </label>
          <input
            id="slack-client-id"
            type="text"
            value={displayValue}
            onChange={(e) => handleClientIdChange(e.target.value)}
            onFocus={() => {
              if (!settings.slackClientId) {
                handleClientIdChange(displayValue);
              }
            }}
            className="w-full min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <p className="mt-1 text-xs text-gray-400">
            The client ID of your Slack app. Clear the field and save to restore the built-in default.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium text-amber-800">Slack app requirements</p>
          <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
            <li><strong>PKCE</strong> must be enabled (no client secret is used)</li>
            <li>The <code className="bg-amber-100 px-0.5 rounded">emoji:read</code> user scope must be added</li>
            <li>Add this <strong>redirect URL</strong> to your Slack app:</li>
          </ul>
          {redirectUrl && (
            <div className="flex items-start gap-1.5">
              <code className="flex-1 min-w-0 text-xs bg-amber-100 text-amber-900 px-2 py-1 rounded break-all select-all">
                {redirectUrl}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(redirectUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="shrink-0 p-1 rounded hover:bg-amber-200 transition-colors cursor-pointer"
                title="Copy to clipboard"
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          className="w-full px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors cursor-pointer"
        >
          {saved ? "Saved!" : "Save"}
        </button>
      </div>
    </div>
  );
}
