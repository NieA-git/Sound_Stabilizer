// injected_script.js 1.6.1 (исправление MutationObserver и Response Timeout)
(function() {
    "use strict";
    if (window.hasRunStabilizer) return;
    window.hasRunStabilizer = true;
    
    const instanceId = Math.random().toString(36).substr(2, 9); 
    let audioContext, sourceNode, preAnalyser, compressor, gainNode, postAnalyser;
    let isStabilizerOn = false, debugMode = false, currentVideo = null; 
    let currentT = -25, currentR = 15, currentG = 0.5, meterInterval = null;

    function sendResp(action, payload) {
        const hasVideo = !!findVideo(); 
        window.postMessage({ source: 'stabilizer_page_script', action: "cmd_response", payload: { ...payload, hasVideo } }, '*');
    }

    function sendVol(data) {
        window.postMessage({ source: 'stabilizer_page_script', payload: { action: "updateVolumeMeter", instanceId, ...data } }, '*');
    }

    window.addEventListener('message', (e) => {
        if (e.data.source !== 'stabilizer_loader_script') return;
        const req = e.data.payload;

        // ИСПРАВЛЕНИЕ: Каждое действие ОБЯЗАТЕЛЬНО вызывает sendResp, чтобы не было Response Timeout
        if (req.action === "toggleStabilizer") {
            const newStatus = toggle();
            sendResp("toggleStabilizer", { status: newStatus });
        }
        else if (req.action === "getStatus") sendResp("getStatus", { status: isStabilizerOn ? 'on' : 'off' });
        else if (req.action === "getSettings") sendResp("getSettings", { settings: { threshold: currentT, ratio: currentR, gain: currentG } });
        else if (req.action === "updateSettings") { updateSettings(req.settings); sendResp("updateSettings", { ok: true }); }
        else if (req.action === "setDebugMode") { debugMode = req.enabled; sendResp("setDebugMode", { ok: true }); }
    });

    function updateSettings(s) {
        if (s.threshold !== undefined) currentT = parseFloat(s.threshold);
        if (s.ratio !== undefined) currentR = parseFloat(s.ratio);
        if (s.gain !== undefined) currentG = parseFloat(s.gain);
        
        if (isStabilizerOn && compressor && audioContext) {
            const now = audioContext.currentTime;
            compressor.threshold.setTargetAtTime(currentT, now, 0.01);
            compressor.ratio.setTargetAtTime(currentR, now, 0.01);
            gainNode.gain.setTargetAtTime(currentG, now, 0.01);
        }
    }
    
    function findVideo(root = document) {
        try {
            let video = root.querySelector('video, audio');
            if (video) return video;
            const hosts = root.querySelectorAll('*');
            for (const host of hosts) {
                if (host.shadowRoot) {
                    video = findVideo(host.shadowRoot);
                    if (video) return video;
                }
            }
        } catch (e) { return null; }
        return null;
    }
    
    function resetAudioSystem() {
        if (meterInterval) clearInterval(meterInterval);
        if (sourceNode) try { sourceNode.disconnect(); } catch(e) {}
        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close().catch(() => {});
        }
        audioContext = null;
        sourceNode = null;
        currentVideo = null;
        isStabilizerOn = false;
        sendVol({ volume: 0, debugVolumePre: 0 });
    }

    function toggle() {
        try {
            const video = findVideo(); 
            if (!video || (currentVideo && currentVideo !== video && isStabilizerOn)) {
                 resetAudioSystem();
                 if (!video) return 'off';
            }

            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                compressor = audioContext.createDynamicsCompressor();
                gainNode = audioContext.createGain();
                preAnalyser = audioContext.createAnalyser();
                postAnalyser = audioContext.createAnalyser();
                updateSettings({});
            }

            if (!sourceNode || currentVideo !== video) {
                 if (sourceNode) try { sourceNode.disconnect(); } catch(e) {}
                 // ВНИМАНИЕ: На YouTube crossOrigin может вызывать перезагрузку, используем аккуратно
                 if (video.src && video.src.indexOf('blob:') !== 0 && !video.crossOrigin) {
                    video.crossOrigin = "anonymous";
                 }
                 
                 sourceNode = audioContext.createMediaElementSource(video);
                 currentVideo = video;
            }

            if (audioContext.state === 'suspended') audioContext.resume();

            if (isStabilizerOn) {
                sourceNode.disconnect();
                sourceNode.connect(audioContext.destination);
                clearInterval(meterInterval);
                isStabilizerOn = false;
                return 'off';
            } else {
                sourceNode.disconnect();
                sourceNode.connect(preAnalyser);
                preAnalyser.connect(compressor); 
                compressor.connect(gainNode);
                gainNode.connect(postAnalyser);
                postAnalyser.connect(audioContext.destination);
                meterInterval = setInterval(measure, 40);
                isStabilizerOn = true;
                return 'on';
            }
        } catch (e) {
            console.error("Critical Toggle Error:", e);
            resetAudioSystem();
            return 'off';
        }
    }

    function measure() {
        if (!postAnalyser || !isStabilizerOn) return;
        const video = findVideo();
        if (!video || currentVideo !== video) {
             resetAudioSystem();
             return;
        }

        const postData = new Uint8Array(postAnalyser.frequencyBinCount);
        postAnalyser.getByteFrequencyData(postData);
        const avgPost = postData.reduce((a, b) => a + b, 0) / postData.length;
        let avgPre = null;
        if (debugMode && preAnalyser) {
            const preData = new Uint8Array(preAnalyser.frequencyBinCount);
            preAnalyser.getByteFrequencyData(preData);
            avgPre = preData.reduce((a, b) => a + b, 0) / preData.length;
        }
        sendVol({ volume: avgPost, debugVolumePre: avgPre });
    }
    
    // ИСПРАВЛЕНИЕ MutationObserver: Безопасная инициализация
    const startObserver = () => {
        if (!document.body) {
            setTimeout(startObserver, 200);
            return;
        }
        const observer = new MutationObserver(() => {
            const video = findVideo();
            if (video && video !== currentVideo && isStabilizerOn) {
                 resetAudioSystem();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }
})();
