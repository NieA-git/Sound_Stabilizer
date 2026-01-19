// content_loader.js v2025
(function() {
    "use strict";

    // Внедрение скрипта страницы
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected_script.js');
    script.onload = function() { this.remove(); };
    (document.head || document.documentElement).appendChild(script);

    // Мост: Страница -> Background (Громкость)
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.data?.source !== 'stabilizer_page_script') return;
        if (event.data.payload?.action === "updateVolumeMeter") {
            chrome.runtime.sendMessage(event.data.payload).catch(() => {});
        }
    });

    // Мост: Background -> Страница (Команды)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const handler = (event) => {
            if (event.data?.source === 'stabilizer_page_script' && event.data.action === "cmd_response") {
                const res = event.data.payload;
                // КЛЮЧЕВОЕ: Отвечаем только если в этом фрейме есть видео или это настройки
                if (res.hasVideo || res.settings || request.action === "updateSettings") {
                    sendResponse(res);
                    window.removeEventListener('message', handler);
                }
            }
        };

        window.addEventListener('message', handler);
        window.postMessage({ source: 'stabilizer_loader_script', payload: request }, '*');

        setTimeout(() => window.removeEventListener('message', handler), 500);
        return true; 
    });
})();
