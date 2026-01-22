// content_loader.js 1.6.1 (Исправлено: Удален таймаут ответа, используется только надежное ожидание)
(function() {
    "use strict";

    // ИСПРАВЛЕНИЕ: Проверяем, разрешено ли нам вообще работать в фрейме
    if (window.self !== window.top && !window.origin) {
        return;
    }

    // Внедрение скрипта страницы
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected_script.js');
    script.onload = function() { this.remove(); };
    (document.head || document.documentElement).appendChild(script);

    // Helper функция для отправки сообщений с логикой повторных попыток
    async function sendMessageWithRetry(payload, retries = 3, delay = 500) {
        for (let i = 0; i < retries; i++) {
            try {
                // Ждем завершения sendMessage. Если Service Worker спит, он выкинет ошибку тут же.
                await chrome.runtime.sendMessage(payload);
                return; // Успешно отправлено
            } catch (error) {
                console.warn(`Message send failed (attempt ${i + 1}/${retries}):`, error.message);
                if (i === retries - 1) {
                    console.error("Message failed to send to background after all retries:", error);
                    throw error; // Выкидываем ошибку, если все попытки провалены
                }
                // Ждем перед повторной попыткой
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Мост: Страница -> Background (Громкость)
    window.addEventListener('message', (event) => {
        if (event.source !== window || event.data?.source !== 'stabilizer_page_script') return;
        if (event.data.payload?.action === "updateVolumeMeter") {
            // Используем новую функцию с повторной отправкой вместо прямого sendMessage и пустого .catch()
            // Для данных громкости нам не важен ответ, это "fire-and-forget", поэтому .catch() пустой
            sendMessageWithRetry(event.data.payload).catch(() => {});
        }
    });

    // Мост: Background -> Страница (Команды)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Используем Promise для обработки асинхронного ответа БЕЗ ТАЙМАУТА
        const responsePromise = new Promise((resolve) => {
            const handler = (event) => {
                if (event.data?.source === 'stabilizer_page_script' && event.data.action === "cmd_response") {
                    const res = event.data.payload;
                    // КЛЮЧЕВОЕ: Отвечаем только если в этом фрейме есть видео или это настройки
                    if (res.hasVideo || res.settings || request.action === "updateSettings") {
                        window.removeEventListener('message', handler);
                        resolve(res); // Успешный ответ
                    }
                }
            };

            window.addEventListener('message', handler);

            // Отправляем сообщение на страницу
            window.postMessage({ source: 'stabilizer_loader_script', payload: request }, '*');

            // !!! УДАЛЕН ТАЙМАУТ !!! Мы полностью полагаемся на ответ от injected_script.js
        });

        responsePromise
            .then(response => sendResponse(response))
            .catch(error => {
                // Сюда мы больше не попадем из-за таймаута, только если resolve() не сработает
                console.error(error.message);
                sendResponse({ error: error.message }); 
            });

        return true; // Необходимо для асинхронного sendResponse
    });
})();
