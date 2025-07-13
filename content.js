(function () {
  const step = 0.2;
  let muteThreshold = parseFloat(localStorage.getItem('muteThreshold')) || 3.5;
  const videoOverlays = new WeakMap();

  function ensureOverlay(video) {
    const existing = videoOverlays.get(video);
    if (existing && document.body.contains(existing.wrapper)) return existing;

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      position: 'absolute',
      top: '10px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.4)',
      color: 'rgba(255, 255, 255, 0.5)',
      padding: '3px 8px',
      borderRadius: '4px',
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      zIndex: 1000,
      pointerEvents: 'none', // 👈 FIX: prevent stealing focus
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.5)'
    });

    const text = document.createElement('span');
    text.textContent = `${video.playbackRate.toFixed(1)}x 🔊`;

    const settings = document.createElement('span');
    settings.textContent = '⚙';
    settings.style.cursor = 'pointer';
    settings.style.pointerEvents = 'auto'; // 👈 allow only gear to be clickable

    settings.onclick = (e) => {
      e.stopPropagation();
      const input = prompt("Set mute threshold speed (e.g. 3.5)", muteThreshold);
      if (input !== null && !isNaN(input)) {
        muteThreshold = parseFloat(input);
        localStorage.setItem('muteThreshold', muteThreshold.toString());
        updateOverlay(video);
      }
    };

    wrapper.appendChild(text);
    wrapper.appendChild(settings);
    document.body.appendChild(wrapper);

    // Always reposition on DOM changes
    const observer = new MutationObserver(() => positionOverlay(video, wrapper));
    observer.observe(document.body, { childList: true, subtree: true });

    positionOverlay(video, wrapper);
    videoOverlays.set(video, { wrapper, text });
    return { wrapper, text };
  }

  function positionOverlay(video, overlay) {
  const rect = video.getBoundingClientRect();
  Object.assign(overlay.style, {
    position: 'fixed',
    top: `${rect.top + 10}px`,
    left: `${rect.left + 10}px`
  });

  const fullscreenEl = document.fullscreenElement;
  const targetParent = fullscreenEl || document.body;

  if (overlay.parentNode !== targetParent) {
    targetParent.appendChild(overlay);
  }
}


  function reflowAllOverlays() {
    document.querySelectorAll('video').forEach(video => {
      const overlay = videoOverlays.get(video);
      if (overlay) {
        positionOverlay(video, overlay.wrapper);
      }
    });
  }

  function updateOverlay(video) {
    const overlay = videoOverlays.get(video);
    if (!overlay) return;
    const icon = video.muted ? '🔇' : '🔊';
    overlay.text.textContent = `${video.playbackRate.toFixed(1)}x ${icon}`;
  }

  window.addEventListener('resize', reflowAllOverlays);
  document.addEventListener('fullscreenchange', reflowAllOverlays);

  // ✅ Fix: use window instead of document
  window.addEventListener('keydown', function (e) {
    const key = e.key.toLowerCase();
    const videos = document.querySelectorAll('video');
    if (!videos.length) return;

    videos.forEach(video => {
      const { wrapper, text } = ensureOverlay(video);

      if (key === 'd') {
        video.playbackRate = Math.min(video.playbackRate + step, 16);
      } else if (key === 's') {
        video.playbackRate = Math.max(video.playbackRate - step, 0.1);
      } else if (key === 'r') {
        video.playbackRate = 1.0;
      } else {
        return;
      }

      video.muted = video.playbackRate >= muteThreshold;
      updateOverlay(video);
      positionOverlay(video, wrapper);
    });
  });
})();
