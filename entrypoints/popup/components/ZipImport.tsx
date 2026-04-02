import { useState, useRef } from "react";
import type { EmojiMap, ZipSource } from "@/lib/types";
import { setEmojiImageData, addSource, buildEmojiRefs } from "@/lib/storage";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

type State =
  | { step: "pick" }
  | { step: "processing"; fileName: string; current: number; total: number }
  | { step: "done"; fileName: string; count: number }
  | { step: "error"; message: string };

export default function ZipImport() {
  const [state, setState] = useState<State>({ step: "pick" });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setState({ step: "processing", fileName: file.name, current: 0, total: 0 });

    try {
      const { BlobReader, ZipReader, BlobWriter } = await import("@zip.js/zip.js");
      const reader = new ZipReader(new BlobReader(file), {
        useWebWorkers: false,
      });
      const entries = await reader.getEntries();

      const imageEntries = entries.filter((entry) => {
        if (entry.directory || !entry.getData) return false;
        const pathParts = entry.filename.split("/");
        const fileName = pathParts[pathParts.length - 1];
        if (fileName.startsWith(".") || fileName.startsWith("__")) return false;
        const dotIndex = fileName.lastIndexOf(".");
        if (dotIndex === -1) return false;
        const ext = fileName.slice(dotIndex + 1).toLowerCase();
        if (!IMAGE_EXTENSIONS.has(ext)) return false;
        const name = fileName.slice(0, dotIndex);
        return name && /^[\w+-]+$/.test(name);
      });

      setState((s) => s.step === "processing" ? { ...s, total: imageEntries.length } : s);

      const emojis: EmojiMap = {};
      let processed = 0;

      for (const entry of imageEntries) {
        const pathParts = entry.filename.split("/");
        const fileName = pathParts[pathParts.length - 1];
        const dotIndex = fileName.lastIndexOf(".");
        const name = fileName.slice(0, dotIndex);

        const blob = await entry.getData!(new BlobWriter());
        const dataUrl = await blobToDataUrl(blob);
        emojis[name] = dataUrl;

        processed++;
        setState((s) => s.step === "processing" ? { ...s, current: processed } : s);
      }

      await reader.close();

      if (Object.keys(emojis).length === 0) {
        setState({ step: "error", message: "No valid emoji images found in the ZIP file." });
        return;
      }

      const zipName = file.name.replace(/\.zip$/i, "");
      const id = crypto.randomUUID();

      await setEmojiImageData(id, emojis);
      const refs = buildEmojiRefs(id, Object.keys(emojis));

      const source: ZipSource = {
        type: "zip",
        id,
        name: zipName,
        emojis: refs,
        addedAt: Date.now(),
      };
      await addSource(source);

      setState({ step: "done", fileName: zipName, count: Object.keys(emojis).length });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "Failed to import ZIP",
      });
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="p-6 flex items-center justify-center min-h-[380px]">
      <div className="w-full">
        {state.step === "pick" && (
          <div className="text-center space-y-5">
            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-gray-900">Import Emoji ZIP</h1>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Select a ZIP file containing emoji images.<br />
                Filename becomes the emoji name.
              </p>
            </div>

            <button
              onClick={() => fileRef.current?.click()}
              className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
            >
              Choose ZIP file
            </button>

            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={onFileChange}
            />

            <p className="text-xs text-gray-400">
              PNG, JPG, GIF, WebP, SVG
            </p>
          </div>
        )}

        {state.step === "processing" && (
          <div className="text-center space-y-5">
            <div>
              <div className="animate-spin rounded-full h-10 w-10 border-3 border-blue-600 border-t-transparent mx-auto mb-3" />
              <h2 className="text-base font-semibold text-gray-900">Importing...</h2>
              <p className="text-sm text-gray-500 mt-1 truncate">{state.fileName}</p>
            </div>

            {state.total > 0 && (
              <div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-200"
                    style={{ width: `${Math.round((state.current / state.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {state.current} / {state.total} emojis
                </p>
              </div>
            )}
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
                Added <span className="font-medium text-gray-900">{state.count}</span> emojis
                from <span className="font-medium text-gray-900">{state.fileName}</span>
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
                setState({ step: "pick" });
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
