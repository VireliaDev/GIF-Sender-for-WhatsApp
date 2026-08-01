// Injected by content.js into the page's own JS context, where WhatsApp's
// internal modules are reachable. Its only job is to put converted files into
// WhatsApp's media drawer, the same way the built-in GIF picker does. It never
// sends a message; the user reviews the preview and presses send.

(function () {
    "use strict";
    if (window.__waGifPageLoaded) return;
    window.__waGifPageLoaded = true;

    // WhatsApp modules needed to stage an attachment.
    const REQUIRED_MODULES = ["WAWebCmd", "WAWebChatCollection"];

    // Returns { ok: true, Cmd, ChatCollection } once the modules are loaded,
    // { ok: false } if this version of WhatsApp no longer has them, or null
    // while the page is still starting up.
    function findWhatsAppModules() {
        if (typeof window.require !== "function") return null;
        try {
            const moduleMap = window.require("__debug").modulesMap;
            if (REQUIRED_MODULES.some((name) => !moduleMap[name])) {
                // A large map means WhatsApp has finished loading and the
                // modules really are gone, most likely renamed in an update.
                // A small one means it is still booting, so keep waiting.
                return Object.keys(moduleMap).length > 5000 ? { ok: false } : null;
            }
            const Cmd = window.require(REQUIRED_MODULES[0]).Cmd;
            const ChatCollection = window.require(REQUIRED_MODULES[1]).ChatCollection;
            if (Cmd && typeof Cmd.trigger === "function" && ChatCollection && ChatCollection.get) {
                return { ok: true, Cmd, ChatCollection };
            }
        } catch {}
        return null;
    }

    // Resolves with the modules, or null if they never turn up.
    let resolveModulesReady;
    const modulesReady = new Promise((resolve) => (resolveModulesReady = resolve));

    // Poll until the modules appear, giving up after 60 seconds, then tell the
    // content script whether the extension works on this version.
    let attempts = 0;
    let finished = false;
    const pollTimer = setInterval(() => {
        if (finished) return;
        const result = findWhatsAppModules();
        if (result) {
            finished = true;
            clearInterval(pollTimer);
            if (!result.ok) console.warn("[wa-gif] WhatsApp modules not found — extension out of date");
            resolveModulesReady(result.ok ? result : null);
            window.postMessage({ type: "WA_GIF_STATUS", ok: result.ok }, "*");
        } else if (++attempts > 300) {
            finished = true;
            clearInterval(pollTimer);
            console.warn("[wa-gif] WhatsApp modules never appeared — extension out of date");
            resolveModulesReady(null);
            window.postMessage({ type: "WA_GIF_STATUS", ok: false }, "*");
        }
    }, 200);

    // The chat currently open on screen.
    function getActiveChat(ChatCollection) {
        return (
            (ChatCollection.getActive && ChatCollection.getActive()) ||
            (ChatCollection.getModelsArray &&
                ChatCollection.getModelsArray().find((chat) => chat && chat.active)) ||
            null
        );
    }

    // Builds the attachment record WhatsApp expects. isGif and fileOrigin 22
    // mark the file as coming from the GIF picker, which is what makes
    // WhatsApp loop it and show the GIF badge. WhatsApp regenerates the
    // preview and duration itself.
    function makeAttachment(file) {
        return Promise.resolve({
            file,
            filename: file.name || "clip.mp4",
            mimetype: file.type || "video/mp4",
            isGif: true,
            gifAttribution: 1,
            type: "video",
        });
    }

    // Opens WhatsApp's media drawer with the given files staged as GIFs.
    async function stageInComposer(files) {
        if (!files.length) throw new Error("no files");
        const modules = await modulesReady;
        if (!modules) throw new Error("not ready");

        const chat = getActiveChat(modules.ChatCollection);
        if (!chat) throw new Error("no active chat");

        modules.Cmd.trigger("attach_media_drawer", {
            chat,
            attachments: files.map(makeAttachment),
            initCaption: { timestamp: Math.floor(Date.now() / 1000), text: "" },
            fileOrigin: 22,
        });
    }

    // Converted files arrive here from content.js, and the result goes back
    // the same way.
    window.addEventListener("message", async (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== "WA_GIF_ATTACH") return;

        const entries = Array.isArray(msg.files) ? msg.files : [];
        const mp4Files = entries.map(
            (entry) => new File([entry.buffer], entry.name || "clip.mp4", { type: "video/mp4" })
        );

        try {
            await stageInComposer(mp4Files);
            window.postMessage({ type: "WA_GIF_RESULT", ok: true }, "*");
        } catch (err) {
            console.error("[wa-gif] staging failed", err);
            window.postMessage(
                { type: "WA_GIF_RESULT", ok: false, error: String((err && err.message) || err) },
                "*"
            );
        }
    });
})();
