// injected_script.js v2025
(function() {
    "use strict";
    if (window.hasRunStabilizer) return;
    window.hasRunStabilizer = true;
    
    const instanceId = Math.random().toString(36).substr(2, 9); 
    let audioContext, sourceNode, preAnalyser, compressor, gainNode, postAnalyser;
    let isStabilizerOn = false, debugMode = false, currentVideo = null;
    let currentT = -25, currentR = 15, currentG = 0.5, meterInterval = null;

    function sendResp(action, payload) {
        const hasVideo = !!findVideo(); // Используем новый поиск
        window.postMessage({ source: 'stabilizer_page_script', action: "cmd_response", payload: { ...payload, hasVideo } }, '*');
    }


    function sendVol(data) {
        window.postMessage({ source: 'stabilizer_page_script', payload: { action: "updateVolumeMeter", instanceId, ...data } }, '*');
    }

    window.addEventListener('message', (e) => {
        if (e.data.source !== 'stabilizer_loader_script') return;
        const req = e.data.payload;

        if (req.action === "toggleStabilizer") sendResp("toggleStabilizer", { status: toggle() });
        else if (req.action === "getStatus") sendResp("getStatus", { status: isStabilizerOn ? 'on' : 'off' });
        else if (req.action === "getSettings") sendResp("getSettings", { settings: { threshold: currentT, ratio: currentR, gain: currentG } });
        else if (req.action === "updateSettings") { updateSettings(req.settings); sendResp("updateSettings", { ok: true }); }
        else if (req.action === "setDebugMode") { debugMode = req.enabled; sendResp("setDebugMode", { ok: true }); }
    });

    function updateSettings(s) {
        if (s.threshold !== undefined) currentT = parseFloat(s.threshold);
        if (s.ratio !== undefined) currentR = parseFloat(s.ratio);
        if (s.gain !== undefined) currentG = parseFloat(s.gain);
        if (compressor && audioContext) {
            const now = audioContext.currentTime;
            compressor.threshold.setValueAtTime(currentT, now);
            compressor.ratio.setValueAtTime(currentR, now);
            gainNode.gain.setValueAtTime(currentG, now);
        }
    }

    // НОВАЯ ФУНКЦИЯ: Ищет видео даже внутри Shadow DOM
    function findVideo(root = document) {
        let video = root.querySelector('video, audio');
        if (video) return video;
        const hosts = root.querySelectorAll('*');
        for (const host of hosts) {
            if (host.shadowRoot) {
                video = findVideo(host.shadowRoot);
                if (video) return video;
            }
        }
        return null;
    }

    function toggle() {
        const video = findVideo(); // Используем новый поиск
        if (!video) return 'off';
        if (!video.crossOrigin) video.crossOrigin = "anonymous"; 
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            sourceNode = audioContext.createMediaElementSource(video);
            compressor = audioContext.createDynamicsCompressor();
            gainNode = audioContext.createGain();
            preAnalyser = audioContext.createAnalyser();
            postAnalyser = audioContext.createAnalyser();
            updateSettings({});
        }
        if (audioContext.state === 'suspended') audioContext.resume();
        if (isStabilizerOn) {
            sourceNode.disconnect();
            sourceNode.connect(audioContext.destination);
            clearInterval(meterInterval);
            isStabilizerOn = false;
        } else {
            sourceNode.disconnect();
            sourceNode.connect(preAnalyser);
            sourceNode.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(postAnalyser);
            postAnalyser.connect(audioContext.destination);
            meterInterval = setInterval(measure, 40);
            isStabilizerOn = true;
        }
        return isStabilizerOn ? 'on' : 'off';
    }

    function measure() {
        if (!postAnalyser || !isStabilizerOn) return;
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
})();
