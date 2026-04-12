import { useMemo, useRef, useState } from "react";
import { getSource, replaceEmojiOverridesForSource, updateSource } from "@/lib/storage";
import { parseIconPackConfig } from "@/lib/icon-pack";

type State =
  | { step: "pick"; sourceName: string }
  | { step: "processing"; sourceName: string; fileName: string }
  | { step: "done"; sourceName: string }
  | { step: "error"; sourceName: string; message: string };

export default function ConfigImport() {
  const sourceId = useMemo(
    () => new URLSearchParams(window.location.search).get("sourceId"),
    [],
  );
  const [state, setState] = useState<State>({ step: "pick", sourceName: "Source" });
  const fileRef = useRef<HTMLInputElement>(null);

  const applyConfig = async (raw: string) => {
    if (!sourceId) {
      throw new Error("Missing source id");
    }

    const source = await getSource(sourceId);
    if (!source) {
      throw new Error("Source not found");
    }

    const config = parseIconPackConfig(raw, Object.keys(source.emojis));
    await updateSource(sourceId, (current) => ({
      ...current,
      name: config.sourceName ?? current.name,
      domainFilter: config.domainFilter,
    }));
    await replaceEmojiOverridesForSource(sourceId, config.overrides);

    return config.sourceName ?? source.name;
  };

  const handleFile = async (file: File) => {
    setState((current) => ({
      step: "processing",
      sourceName: current.sourceName,
      fileName: file.name,
    }));

    try {
      const nextName = await applyConfig(await file.text());
      setState({ step: "done", sourceName: nextName });
    } catch (err) {
      setState((current) => ({
        step: "error",
        sourceName: current.sourceName,
        message: err instanceof Error ? err.message : "Failed to import config",
      }));
    }
  };

  return (
    <div className="p-6 flex items-center justify-center min-h-[320px]">
      <div className="w-full">
        {state.step === "pick" && (
          <div className="text-center space-y-5">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-gray-900">Import Config</h1>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Select a config JSON file for this emoji source.
              </p>
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full bg-teal-600 text-white py-2.5 px-4 rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors cursor-pointer"
            >
              Choose JSON file
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
        )}

        {state.step === "processing" && (
          <div className="text-center space-y-5">
            <div>
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-teal-600 border-t-transparent mx-auto mb-3" />
              <h2 className="text-base font-semibold text-gray-900">Importing...</h2>
              <p className="text-sm text-gray-500 mt-1 truncate">{state.fileName}</p>
            </div>
          </div>
        )}

        {state.step === "done" && (
          <div className="text-center space-y-5">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900">Import complete</h2>
              <p className="text-sm text-gray-500 mt-1">
                Config applied to <span className="font-medium text-gray-900">{state.sourceName}</span>
              </p>
            </div>

            <button
              onClick={() => window.close()}
              className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {state.step === "error" && (
          <div className="text-center space-y-5">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-gray-900">Import failed</h2>
              <p className="text-sm text-red-600 mt-2">{state.message}</p>
            </div>

            <button
              onClick={() => {
                setState({ step: "pick", sourceName: state.sourceName });
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
