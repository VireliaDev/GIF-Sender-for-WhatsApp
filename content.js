// Content script (isolated world). Owns the UI: the floating GIF button, the
// conversion panel, and the drag-and-drop interception. Converted files are
// handed to page.js, which stages them in WhatsApp's media drawer — the user
// always presses WhatsApp's own Send button; nothing is sent automatically.

(() => {
    if (window.__waGifContentLoaded) return;
    window.__waGifContentLoaded = true;

    // ------------------------------------------------- WhatsApp page hook ----
    // page.js must run in the page's main world to reach WhatsApp's modules,
    // so it is injected as a real <script> tag rather than a content script.
    function injectPageScript() {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("page.js");
        (document.head || document.documentElement).appendChild(script);
        script.onload = () => script.remove();
    }
    injectPageScript();

    // ------------------------------------------------------------------ UI ----
    const style = document.createElement("style");
    style.textContent = `
  #wa-gif-launch{position:fixed;right:18px;bottom:96px;z-index:2147483647;
    width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;
    background:#25d366;color:#0b1f14;font:700 13px/1 system-ui,sans-serif;
    box-shadow:0 2px 10px rgba(0,0,0,.35)}
  #wa-gif-launch:hover{filter:brightness(1.05)}
  #wa-gif-panel{position:fixed;right:18px;bottom:150px;z-index:2147483647;
    width:280px;padding:14px;border-radius:12px;background:#111b21;color:#e9edef;
    font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);
    display:none}
  #wa-gif-panel.open{display:block}
  #wa-gif-panel h3{margin:0 0 8px;font-size:13px;font-weight:700}
  #wa-gif-file{width:100%;margin:6px 0 10px;color:#aebac1}
  #wa-gif-send,#wa-gif-cancel{width:100%;padding:9px;border:none;border-radius:8px;
    cursor:pointer;font-weight:700}
  #wa-gif-send{background:#25d366;color:#0b1f14}
  #wa-gif-send:disabled{opacity:.5;cursor:default}
  #wa-gif-cancel{background:#2a3942;color:#e9edef;margin-top:6px;display:none}
  #wa-gif-panel.busy #wa-gif-cancel{display:block}
  #wa-gif-panel.busy #wa-gif-file{pointer-events:none;opacity:.5}
  #wa-gif-bar{height:4px;margin-top:10px;border-radius:2px;background:#2a3942;
    overflow:hidden;display:none}
  #wa-gif-panel.busy #wa-gif-bar{display:block}
  #wa-gif-bar-fill{height:100%;width:0%;background:#25d366;transition:width .12s linear}
  #wa-gif-status{margin-top:10px;min-height:16px;color:#8696a0;font-size:12px}
  #wa-gif-panel.notready #wa-gif-file,
  #wa-gif-panel.notready #wa-gif-send{display:none}
  #wa-gif-drop{position:fixed;inset:0;z-index:2147483646;display:none;
    pointer-events:none;align-items:center;justify-content:center;
    background:rgba(11,20,26,.72);border:3px dashed #25d366}
  #wa-gif-drop.show{display:flex}
  #wa-gif-drop span{padding:14px 26px;border-radius:12px;background:#111b21;
    color:#e9edef;font:700 16px/1 system-ui,sans-serif;
    box-shadow:0 6px 24px rgba(0,0,0,.45)}
`;
    document.documentElement.appendChild(style);

    const launchButton = document.createElement("button");
    launchButton.id = "wa-gif-launch";
    launchButton.textContent = "GIF";
    launchButton.title = "Send an animated GIF";

    const dropOverlay = document.createElement("div");
    dropOverlay.id = "wa-gif-drop";
    dropOverlay.innerHTML = "<span>Drop to send as GIF</span>";

    const panel = document.createElement("div");
    panel.id = "wa-gif-panel";
    panel.classList.add("notready"); // controls stay hidden until WhatsApp confirms
    panel.innerHTML = `
  <h3>Send GIF to this chat</h3>
  <input id="wa-gif-file" type="file" accept="image/gif,image/webp,image/apng,video/mp4,video/webm,video/quicktime" />
  <button id="wa-gif-send" disabled>Convert &amp; insert</button>
  <button id="wa-gif-cancel">Cancel</button>
  <div id="wa-gif-bar"><div id="wa-gif-bar-fill"></div></div>
  <div id="wa-gif-status">Connecting to WhatsApp…</div>
`;

    document.documentElement.appendChild(launchButton);
    document.documentElement.appendChild(dropOverlay);
    document.documentElement.appendChild(panel);

    const fileInput = panel.querySelector("#wa-gif-file");
    const sendButton = panel.querySelector("#wa-gif-send");
    const cancelButton = panel.querySelector("#wa-gif-cancel");
    const progressBarFill = panel.querySelector("#wa-gif-bar-fill");
    const statusText = panel.querySelector("#wa-gif-status");

    const setStatus = (text) => (statusText.textContent = text);
    const setProgressBar = (fraction) =>
        (progressBarFill.style.width =
            Math.round(Math.max(0, Math.min(1, fraction)) * 100) + "%");

    // True once page.js confirms WhatsApp's internal modules were found.
    let whatsappReady = false;

    launchButton.addEventListener("click", () => panel.classList.toggle("open"));

    // Choosing a file starts the conversion right away; the button stays as a
    // manual retry.
    fileInput.addEventListener("change", () => {
        sendButton.disabled = !fileInput.files.length || !whatsappReady;
        setStatus("");
        if (fileInput.files.length) convertAndStage([fileInput.files[0]]);
    });
    sendButton.addEventListener("click", () => {
        if (fileInput.files.length) convertAndStage([fileInput.files[0]]);
    });

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== "WA_GIF_STATUS") return;
        if (msg.ok) {
            whatsappReady = true;
            panel.classList.remove("notready");
            setStatus("");
            sendButton.disabled = !fileInput.files.length;
        } else {
            setStatus("Out of date — WhatsApp updated");
        }
    });

    // -------------------------------------------------------------- errors ----
    // Tagged so the UI can tell "your file was no good" from "WhatsApp moved".
    class StageError extends Error {
        constructor(message) {
            super(message);
            this.stage = "whatsapp";
        }
    }
    class ConvertError extends Error {
        constructor(code, message) {
            super(message);
            this.stage = "convert";
            this.code = code;
        }
    }

    // ------------------------------------------------------------ convert ----
    // encoder.js runs in this same isolated world and provides __waGifEncode.
    // It cannot run in a Web Worker: WhatsApp Web's Content-Security-Policy
    // (worker-src 'self' blob: data:) blocks workers loaded from extension URLs.
    let cancelRequested = false;
    let batchLabel = ""; // "File 2/3 — " while converting a multi-file drop

    function onProgress(phase, done, total) {
        if (phase === "mux") {
            setProgressBar(1);
            setStatus(batchLabel + "Finishing…");
        } else {
            setProgressBar(total ? done / total : 0);
            setStatus(`${batchLabel}Converting ${done}/${total}…`);
        }
    }

    async function convertToMp4(file) {
        if (typeof __waGifEncode !== "function") {
            throw new ConvertError("internal", "converter didn't load — refresh the page");
        }
        try {
            const { buffer, name } = await __waGifEncode(file, {
                onProgress,
                shouldCancel: () => cancelRequested,
            });
            return new File([buffer], name, { type: "video/mp4" });
        } catch (err) {
            throw new ConvertError(
                (err && err.code) || "convert",
                (err && err.message) || String(err)
            );
        }
    }

    // ---------------------------------------------------------------- flow ----
    // Converts each file, then stages everything that succeeded in WhatsApp's
    // media drawer. The file picker and the drop interceptor both end up here.
    let isConverting = false;

    async function convertAndStage(files) {
        if (!files || !files.length || isConverting) return;
        if (!whatsappReady) {
            setStatus("WhatsApp isn't ready yet");
            return;
        }

        isConverting = true;
        cancelRequested = false;
        panel.classList.add("busy");
        sendButton.disabled = true;
        setProgressBar(0);
        setStatus("Reading file…");

        const converted = [];
        const failures = [];
        try {
            for (let i = 0; i < files.length; i++) {
                if (cancelRequested) break;
                batchLabel = files.length > 1 ? `File ${i + 1}/${files.length} — ` : "";
                setProgressBar(0);
                try {
                    converted.push(await convertToMp4(files[i]));
                } catch (err) {
                    if (cancelRequested) break;
                    failures.push(err);
                }
            }
            batchLabel = "";

            if (cancelRequested) {
                setStatus("Cancelled");
                return;
            }
            if (!converted.length) {
                setStatus(errorMessage(failures[0]));
                return;
            }

            setStatus("Sending to WhatsApp…");
            await stageInWhatsApp(converted);

            setStatus(
                failures.length
                    ? `Staged ${converted.length} ✓ — ${failures.length} failed: ${errorMessage(failures[0])}`
                    : "Done ✓"
            );
            if (!failures.length) {
                setTimeout(() => {
                    closePanel();
                    resetPanel();
                }, 900);
            }
        } catch (err) {
            console.error("[wa-gif]", err);
            setStatus(errorMessage(err));
        } finally {
            batchLabel = "";
            isConverting = false;
            panel.classList.remove("busy");
            setProgressBar(0);
            sendButton.disabled = !fileInput.files.length;
        }
    }

    function errorMessage(err) {
        if (cancelRequested) return "Cancelled";
        if (!err) return "Something went wrong";
        if (err.stage === "whatsapp") return "Failed — WhatsApp may have updated";
        if (err.stage === "convert") return err.message;
        return "Error: " + (err.message || String(err));
    }

    cancelButton.addEventListener("click", () => {
        if (!isConverting) return;
        // The encoder checks this flag between frames and stops.
        cancelRequested = true;
        setStatus("Cancelling…");
    });

    // Sends converted files to page.js and waits for its reply.
    function stageInWhatsApp(mp4Files) {
        return new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
                window.removeEventListener("message", onResult);
                reject(new StageError("no response from page"));
            }, 10000);

            function onResult(event) {
                if (event.source !== window) return;
                const msg = event.data;
                if (!msg || msg.type !== "WA_GIF_RESULT") return;
                window.removeEventListener("message", onResult);
                clearTimeout(timer);
                msg.ok ? resolve() : reject(new StageError(msg.error || "whatsapp update"));
            }
            window.addEventListener("message", onResult);

            const entries = [];
            for (const file of mp4Files) {
                entries.push({ name: file.name, buffer: await file.arrayBuffer() });
            }
            window.postMessage(
                { type: "WA_GIF_ATTACH", files: entries },
                "*",
                entries.map((e) => e.buffer)
            );
        });
    }

    function resetPanel() {
        fileInput.value = "";
        sendButton.disabled = true;
        setStatus("");
    }

    function closePanel() {
        panel.classList.remove("open");
    }

    // ---------------------------------------------------- drop interception ----
    // Capture-phase listeners registered at document_start fire before anything
    // WhatsApp attaches. A drag whose files are all GIFs is taken over and run
    // through the converter; every other drag reaches WhatsApp untouched.
    //
    // While a drag is in progress, the browser only exposes each file's declared
    // MIME type, so that is what the decision uses; the encoder verifies the
    // actual bytes after the drop.

    function dragOnlyHasGifs(dataTransfer) {
        if (!dataTransfer || !dataTransfer.items || !dataTransfer.items.length) {
            return false;
        }
        let gifCount = 0;
        for (const item of dataTransfer.items) {
            if (item.kind !== "file") continue; // text/uri-list etc. ride along
            if (item.type !== "image/gif") return false;
            gifCount++;
        }
        return gifCount > 0;
    }

    // Only intercept when staging can actually happen; otherwise WhatsApp
    // handles the drop as normal.
    const shouldInterceptDrag = (dataTransfer) =>
        whatsappReady && !isConverting && dragOnlyHasGifs(dataTransfer);

    let overlayTimer = null;

    function showDropOverlay() {
        dropOverlay.classList.add("show");
        // dragleave is unreliable when the cursor leaves the window, so the
        // overlay also hides itself when dragover events stop arriving.
        clearTimeout(overlayTimer);
        overlayTimer = setTimeout(hideDropOverlay, 400);
    }

    function hideDropOverlay() {
        clearTimeout(overlayTimer);
        overlayTimer = null;
        dropOverlay.classList.remove("show");
    }

    for (const eventType of ["dragenter", "dragover"]) {
        window.addEventListener(eventType, (event) => {
            if (!shouldInterceptDrag(event.dataTransfer)) {
                hideDropOverlay();
                return;
            }
            event.preventDefault();           // required for the drop to be allowed
            event.stopImmediatePropagation(); // WhatsApp never sees this drag
            event.dataTransfer.dropEffect = "copy";
            showDropOverlay();
        }, true);
    }

    window.addEventListener("drop", (event) => {
        if (!shouldInterceptDrag(event.dataTransfer)) {
            hideDropOverlay();
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        hideDropOverlay();

        const files = [...event.dataTransfer.files];
        if (!files.length) return;
        panel.classList.add("open"); // progress must be visible uninvited
        convertAndStage(files);
    }, true);

    window.addEventListener("dragleave", (event) => {
        // relatedTarget is null when the cursor leaves the window entirely
        if (!event.relatedTarget) hideDropOverlay();
    }, true);

    window.addEventListener("dragend", hideDropOverlay, true);
})();
