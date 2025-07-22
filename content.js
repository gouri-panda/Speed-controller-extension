(function () {
  const step = 0.2;
  let muteThreshold = parseFloat(localStorage.getItem('muteThreshold')) || 3.5;
  const videoOverlays = new WeakMap();
  
  // 🆕 Track which video is currently "active" to prevent multiple overlays
  let activeVideo = null;
  
  // 🆕 Track manual vs automatic mute states for each video
  const videoMuteStates = new WeakMap(); // { isManuallyMuted: boolean, wasAutoMuted: boolean }
  
  function isPreviewVideo(video) {
    // YouTube preview videos are typically in thumbnail containers
    return video.closest('#thumbnail-container, .ytd-thumbnail, .ytd-rich-grid-media, .ytd-video-preview') !== null;
  }
  
  function isMainPlayerVideo(video) {
    // Main player videos are in the player container
    return video.closest('#movie_player, .html5-video-player, #player-container, .ytd-player') !== null;
  }
  
  function getVideoType(video) {
    if (isMainPlayerVideo(video)) return 'main';
    if (isPreviewVideo(video)) return 'preview';
    return 'unknown';
  }
  
  function initVideoMuteState(video) {
    if (!videoMuteStates.has(video)) {
      videoMuteStates.set(video, { 
        isManuallyMuted: video.muted, 
        wasAutoMuted: false 
      });
    }
    return videoMuteStates.get(video);
  }
  
  function handleMuteLogic(video) {
    const muteState = initVideoMuteState(video);
    const shouldAutoMute = video.playbackRate >= muteThreshold;
    
    if (shouldAutoMute) {
      // Speed is high enough to auto-mute
      if (!video.muted) {
        video.muted = true;
        muteState.wasAutoMuted = true;
        muteState.isManuallyMuted = false;
      }
    } else {
      // Speed is low enough to potentially unmute
      if (video.muted && muteState.wasAutoMuted && !muteState.isManuallyMuted) {
        // Only unmute if it was auto-muted and user didn't manually mute
        video.muted = false;
        muteState.wasAutoMuted = false;
      }
      // If user manually muted, keep it muted regardless of speed
    }
  }
  
  function ensureOverlay(video) {
    const videoType = getVideoType(video);
    
    // 🚫 CRITICAL FIX: Only show overlay for one video at a time
    // Priority: main player > preview > others
    if (activeVideo && activeVideo !== video) {
      const activeVideoType = getVideoType(activeVideo);
      
      // If we have a main player video active, don't show overlay for preview
      if (activeVideoType === 'main' && videoType === 'preview') {
        return null;
      }
      
      // If switching from preview to main player, hide preview overlay
      if (activeVideoType === 'preview' && videoType === 'main') {
        cleanupOverlay(activeVideo);
        activeVideo = video;
      }
      
      // If we have any video active and this is the same type, clean up the old one
      if (activeVideoType === videoType) {
        cleanupOverlay(activeVideo);
        activeVideo = video;
      }
    }
    
    // Set this as the active video
    activeVideo = video;
    
    const existing = videoOverlays.get(video);
    
    // ✅ If overlay exists and is still in the DOM, reuse it
    if (existing && document.contains(existing.wrapper)) {
      return existing;
    }
    
    // 🧹 Cleanup: If overlay exists but detached, remove it properly
    if (existing) {
      cleanupOverlayData(existing);
      videoOverlays.delete(video);
    }
    
    // 🚫 Clean up any orphaned overlays
    document.querySelectorAll('[data-video-overlay]').forEach(overlay => overlay.remove());
    
    // ✅ Create new overlay
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-video-overlay', Date.now().toString());
    
    Object.assign(wrapper.style, {
      position: 'fixed', // Always use fixed positioning
      top: '10px',
      left: '10px',
      background: 'rgba(0, 0, 0, 0.7)', // Slightly more opaque for better visibility
      color: 'rgba(255, 255, 255, 0.9)',
      padding: '4px 10px',
      borderRadius: '6px',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      zIndex: 10000, // Higher z-index to ensure visibility
      pointerEvents: 'none',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.1)'
    });
    
    const text = document.createElement('span');
    text.textContent = `${video.playbackRate.toFixed(1)}x 🔊`;
    
    const settings = document.createElement('span');
    settings.textContent = '⚙';
    settings.style.cursor = 'pointer';
    settings.style.pointerEvents = 'auto';
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
    
    // 🔧 Smart parent selection based on fullscreen state
    const targetParent = document.fullscreenElement || document.body;
    targetParent.appendChild(wrapper);
    
    // 🔧 Observer to track video visibility and cleanup + track manual mute changes
    const observer = new MutationObserver(() => {
      if (!document.contains(video)) {
        cleanupOverlay(video);
      } else {
        positionOverlay(video, wrapper);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    // 🆕 Track manual mute/unmute by user
    const muteChangeHandler = () => {
      const muteState = initVideoMuteState(video);
      const shouldAutoMute = video.playbackRate >= muteThreshold;
      
      if (video.muted && !shouldAutoMute) {
        // User manually muted when speed doesn't require it
        muteState.isManuallyMuted = true;
        muteState.wasAutoMuted = false;
      } else if (!video.muted && shouldAutoMute) {
        // User manually unmuted when speed requires mute
        muteState.isManuallyMuted = false;
        muteState.wasAutoMuted = false;
      }
      
      updateOverlay(video);
    };
    
    video.addEventListener('volumechange', muteChangeHandler);
    
    // 🆕 Track when video becomes inactive (for previews that stop playing)
    const inactivityHandler = () => {
      if (video.paused && isPreviewVideo(video)) {
        // Preview video stopped, it's no longer active
        if (activeVideo === video) {
          activeVideo = null;
        }
        cleanupOverlay(video);
      }
    };
    
    video.addEventListener('pause', inactivityHandler);
    video.addEventListener('ended', inactivityHandler);
    
    positionOverlay(video, wrapper);
    
    const overlayData = { wrapper, text, observer, inactivityHandler, muteChangeHandler };
    videoOverlays.set(video, overlayData);
    
    return overlayData;
  }
  
  function cleanupOverlayData(overlayData) {
    if (overlayData.wrapper && overlayData.wrapper.parentNode) {
      overlayData.wrapper.parentNode.removeChild(overlayData.wrapper);
    }
    if (overlayData.observer) {
      overlayData.observer.disconnect();
    }
  }
  
  function cleanupOverlay(video) {
    const overlay = videoOverlays.get(video);
    if (overlay) {
      cleanupOverlayData(overlay);
      videoOverlays.delete(video);
    }
    
    // If this was the active video, clear it
    if (activeVideo === video) {
      activeVideo = null;
    }
  }
  
  function positionOverlay(video, overlay) {
    if (!document.contains(video) || !document.contains(overlay)) {
      return;
    }
    
    const rect = video.getBoundingClientRect();
    const isFullscreen = document.fullscreenElement !== null;
    
    // 🔧 Handle fullscreen positioning for different platforms
    let topOffset, leftOffset;
    
    if (isFullscreen) {
      // In fullscreen, position relative to the fullscreen element
      const fullscreenRect = document.fullscreenElement.getBoundingClientRect();
      topOffset = Math.max(fullscreenRect.top + 20, 20);
      leftOffset = Math.max(fullscreenRect.left + 20, 20);
      
      // Ensure overlay is attached to fullscreen element for proper stacking
      if (overlay.parentNode !== document.fullscreenElement) {
        document.fullscreenElement.appendChild(overlay);
      }
    } else {
      // Regular positioning
      topOffset = Math.max(rect.top + 10, 10);
      leftOffset = Math.max(rect.left + 10, 10);
      
      // Ensure overlay is attached to body when not in fullscreen
      if (overlay.parentNode !== document.body) {
        document.body.appendChild(overlay);
      }
    }
    
    Object.assign(overlay.style, {
      position: isFullscreen ? 'absolute' : 'fixed',
      top: `${topOffset}px`,
      left: `${leftOffset}px`,
      display: rect.width > 0 && rect.height > 0 ? 'flex' : 'none'
    });
  }
  
  function reflowAllOverlays() {
    // Only reflow the active video's overlay
    if (activeVideo) {
      const overlay = videoOverlays.get(activeVideo);
      if (overlay && document.contains(overlay.wrapper)) {
        positionOverlay(activeVideo, overlay.wrapper);
      }
    }
    
    // Clean up any orphaned overlays
    document.querySelectorAll('[data-video-overlay]').forEach(overlay => {
      const hasCorrespondingVideo = Array.from(document.querySelectorAll('video')).some(v => 
        videoOverlays.has(v) && videoOverlays.get(v).wrapper === overlay
      );
      if (!hasCorrespondingVideo) {
        overlay.remove();
      }
    });
  }
  
  // 🆕 Special handler for fullscreen changes
  function handleFullscreenChange() {
    setTimeout(() => {
      // Small delay to let fullscreen transition complete
      reflowAllOverlays();
    }, 100);
  }
  
  function updateOverlay(video) {
    const overlay = videoOverlays.get(video);
    if (!overlay) return;
    
    const muteState = videoMuteStates.get(video);
    let icon = '🔊';
    
    if (video.muted) {
      if (muteState && muteState.isManuallyMuted) {
        icon = '🔇'; // Manual mute - red mute icon
      } else {
        icon = '🔕'; // Auto mute - different icon to show it's automatic
      }
    }
    
    overlay.text.textContent = `${video.playbackRate.toFixed(1)}x ${icon}`;
  }
  
  // 🔧 Debounced resize handler
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(reflowAllOverlays, 100);
  });
  
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Safari
  document.addEventListener('mozfullscreenchange', handleFullscreenChange); // Firefox
  
  // 🔧 Clean up on URL changes (YouTube SPA navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Clear all overlays and reset active video
      document.querySelectorAll('[data-video-overlay]').forEach(overlay => overlay.remove());
      activeVideo = null;
      // Don't clear videoOverlays WeakMap as videos might still exist
    }
  }).observe(document, { subtree: true, childList: true });
  
  window.addEventListener('keydown', function (e) {
    const key = e.key.toLowerCase();
    
    // 🔧 Better video selection logic
    let targetVideo = null;
    
    // First, try to find the main player video
    const mainPlayerVideo = document.querySelector('#movie_player video, .html5-video-player video');
    if (mainPlayerVideo) {
      targetVideo = mainPlayerVideo;
    } else {
      // If no main player, look for any playing video (like previews)
      const allVideos = document.querySelectorAll('video');
      for (const video of allVideos) {
        if (!video.paused) {
          targetVideo = video;
          break;
        }
      }
      
      // If no playing video, use the first visible video
      if (!targetVideo) {
        for (const video of allVideos) {
          const rect = video.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            targetVideo = video;
            break;
          }
        }
      }
    }
    
    if (!targetVideo) return;
    
    // 🔧 Only process if this is a speed control key
    if (!['d', 's', 'r'].includes(key)) return;
    
    const overlayData = ensureOverlay(targetVideo);
    if (!overlayData) return; // Overlay creation was blocked
    
    if (key === 'd') {
      targetVideo.playbackRate = Math.min(targetVideo.playbackRate + step, 16);
    } else if (key === 's') {
      targetVideo.playbackRate = Math.max(targetVideo.playbackRate - step, 0.1);
    } else if (key === 'r') {
      targetVideo.playbackRate = 1.0;
    }
    
    // 🔧 Use the new smart mute logic instead of simple threshold check
    handleMuteLogic(targetVideo);
    updateOverlay(targetVideo);
    positionOverlay(targetVideo, overlayData.wrapper);
  });
  
  // 🆕 Clean up preview overlays when clicking to go to video page
  document.addEventListener('click', (e) => {
    // If clicking on a video thumbnail or link, clean up preview overlays
    const clickTarget = e.target.closest('a[href*="/watch"], #thumbnail, .ytd-thumbnail');
    if (clickTarget && activeVideo && isPreviewVideo(activeVideo)) {
      setTimeout(() => {
        cleanupOverlay(activeVideo);
      }, 100); // Small delay to let navigation start
    }
  }, true);
  
})();
