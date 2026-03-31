import { useState, useEffect } from "react";

interface Props {
  onBack: () => void;
}

export default function ExcludedDomains({ onBack }: Props) {
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDomain, setNewDomain] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = async () => {
    const response = await browser.runtime.sendMessage({
      type: "GET_EXCLUDED_DOMAINS",
    });
    if (response?.domains) {
      setDomains(response.domains);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = async () => {
    const domain = newDomain.toLowerCase().trim();
    if (!domain) return;
    await browser.runtime.sendMessage({
      type: "ADD_EXCLUDED_DOMAIN",
      domain,
    });
    setNewDomain("");
    await refresh();
  };

  const handleRemove = async (domain: string) => {
    setRemoving(domain);
    await browser.runtime.sendMessage({
      type: "REMOVE_EXCLUDED_DOMAIN",
      domain,
    });
    await refresh();
    setRemoving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
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
        <h1 className="text-lg font-bold text-gray-900">Excluded Domains</h1>
      </div>

      <p className="text-xs text-gray-500">
        The extension will not replace emojis on these domains.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder="example.com"
          className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!newDomain.trim()}
          className="px-3 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Add
        </button>
      </form>

      {domains.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-400">
          No domains excluded yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {domains.map((domain) => (
            <li
              key={domain}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 group"
            >
              <span className="text-sm text-gray-800 truncate min-w-0">
                {domain}
              </span>
              <button
                onClick={() => handleRemove(domain)}
                disabled={removing === domain}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                title="Remove"
              >
                {removing === domain ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border border-red-400 border-t-transparent" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
