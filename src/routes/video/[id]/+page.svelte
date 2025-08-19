<!-- Enhanced Video Player with Original Volume Bar and Quality Selection -->
<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  
  export let data;

  // ========== UTILITIES ==========
  
  function detectVideoQuality(videoElement) {
    if (!videoElement) return 'Unknown';
    
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    return '360p';
  }

  function getAvailableQualities(videoElement) {
    // Always provide multiple quality options for users with different internet speeds
    // In a real implementation, you would check which quality versions exist on your server
    const allQualities = ['Auto', '1080p', '720p', '480p', '360p', '240p'];
    
    if (!videoElement) return allQualities;
    
    // Optionally, you can still detect the source quality and limit upward options
    const currentQuality = detectVideoQuality(videoElement);
    
    // For now, return all qualities regardless of source
    // This allows users with slow internet to choose lower qualities
    return allQualities;
  }

  function estimateBandwidth(videoElement) {
    if (!videoElement || !videoElement.buffered.length) return 0;
    
    // Simple bandwidth estimation based on buffered data
    const bufferedBytes = videoElement.buffered.end(0) * 1000000; // Rough estimate
    const timeToBuffer = videoElement.buffered.end(0) / videoElement.playbackRate;
    
    return bufferedBytes / timeToBuffer; // bytes per second
  }

  function formatBitrate(bps) {
    if (bps >= 1000000) {
      return `${(bps / 1000000).toFixed(1)} Mbps`;
    }
    return `${Math.round(bps / 1000)} kbps`;
  }

  function saveVideoProgress(videoId, currentTime, duration) {
    if (typeof window !== 'undefined') {
      const progress = {
        videoId,
        currentTime,
        duration,
        timestamp: Date.now(),
        percentage: (currentTime / duration) * 100
      };
      
      // Using in-memory storage for artifact compatibility
      if (!window.videoProgress) window.videoProgress = {};
      window.videoProgress[videoId] = progress;
    }
  }

  function loadVideoProgress(videoId) {
    if (typeof window !== 'undefined' && window.videoProgress) {
      const progress = window.videoProgress[videoId];
      if (progress) {
        // Only restore if not near the end
        if (progress.percentage < 95) {
          return progress;
        }
      }
    }
    return null;
  }

  // Video analytics helper
  class VideoAnalytics {
    constructor(videoId, userId) {
      this.videoId = videoId;
      this.userId = userId;
      this.startTime = Date.now();
      this.watchTime = 0;
      this.events = [];
    }

    trackEvent(event, data = {}) {
      this.events.push({
        event,
        data,
        timestamp: Date.now() - this.startTime
      });
    }

    startWatching() {
      this.trackEvent('play_start');
      this.watchStartTime = Date.now();
    }

    pauseWatching() {
      if (this.watchStartTime) {
        this.watchTime += Date.now() - this.watchStartTime;
        this.trackEvent('pause', { totalWatchTime: this.watchTime });
        this.watchStartTime = null;
      }
    }

    seek(from, to) {
      this.trackEvent('seek', { from, to });
    }

    changeQuality(quality) {
      this.trackEvent('quality_change', { quality });
    }

    sendAnalytics() {
      // In a real app, you'd send this to your analytics endpoint
      console.log('Analytics:', {
        videoId: this.videoId,
        userId: this.userId,
        watchTime: this.watchTime,
        events: this.events,
        sessionDuration: Date.now() - this.startTime
      });
    }
  }

  // Picture-in-Picture support
  async function requestPictureInPicture(videoElement) {
    if (typeof document === 'undefined' || !document.pictureInPictureEnabled) {
      throw new Error('Picture-in-Picture not supported');
    }
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoElement.requestPictureInPicture();
      }
    } catch (error) {
      console.error('Picture-in-Picture failed:', error);
      throw error;
    }
  }

  // ========== COMPONENT STATE ==========
  
  let videoElement;
  let containerElement;
  let isLoading = true;
  let videoError = null;
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let volume = 1;
  let isFullscreen = false;
  let showControls = true;
  let controlsTimeout;
  let buffered = 0;
  let isBuffering = false;
  let playbackRate = 1;
  let qualities = ['Auto'];
  let selectedQuality = 'Auto';
  let videoQuality = 'Unknown';
  let analytics;
  let pipSupported = false;
  let showQualityMenu = false;

  // Touch/mobile support
  let isMobile = false;
  let lastTouchTime = 0;

  onMount(() => {
    // Initialize analytics
    analytics = new VideoAnalytics(data.video.id, data.user?.id);
    
    // Load saved progress
    const savedProgress = loadVideoProgress(data.video.id);
    if (savedProgress && savedProgress.currentTime > 30) { // Only if more than 30 seconds
      setTimeout(() => {
        if (confirm(`Resume from ${formatTime(savedProgress.currentTime)}?`)) {
          videoElement.currentTime = savedProgress.currentTime;
        }
      }, 1000);
    }
    
    // Detect mobile
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Check Picture-in-Picture support
    pipSupported = typeof document !== 'undefined' && document.pictureInPictureEnabled;
    
    // Auto-hide controls after 3 seconds of inactivity
    const resetControlsTimer = () => {
      clearTimeout(controlsTimeout);
      showControls = true;
      if (isPlaying && !isMobile) {
        controlsTimeout = setTimeout(() => {
          showControls = false;
        }, 3000);
      }
    };

    // Event listeners
    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', resetControlsTimer);
      document.addEventListener('keydown', resetControlsTimer);
      
      // Close quality menu when clicking outside
      const handleClickOutside = (event) => {
        if (showQualityMenu && !event.target.closest('.quality-menu')) {
          showQualityMenu = false;
        }
      };
      document.addEventListener('click', handleClickOutside);
      
      // Fullscreen change detection
      const handleFullscreenChange = () => {
        isFullscreen = !!document.fullscreenElement;
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.addEventListener('mozfullscreenchange', handleFullscreenChange);
      
      return () => {
        clearTimeout(controlsTimeout);
        document.removeEventListener('mousemove', resetControlsTimer);
        document.removeEventListener('keydown', resetControlsTimer);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      };
    }
    
    return () => {
      clearTimeout(controlsTimeout);
    };
  });

  onDestroy(() => {
    clearTimeout(controlsTimeout);
    
    // Save progress and send analytics before leaving
    if (videoElement && duration > 0) {
      saveVideoProgress(data.video.id, currentTime, duration);
    }
    
    if (analytics) {
      analytics.sendAnalytics();
    }
  });

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function togglePlay() {
    if (!videoElement) return;
    
    if (videoElement.paused) {
      videoElement.play().catch(err => {
        console.error('Play failed:', err);
        videoError = 'Failed to play video';
      });
      analytics?.startWatching();
    } else {
      videoElement.pause();
      analytics?.pauseWatching();
    }
  }

  function seekTo(event) {
    if (!videoElement || !duration) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    const oldTime = videoElement.currentTime;
    
    videoElement.currentTime = Math.max(0, Math.min(duration, newTime));
    analytics?.seek(oldTime, newTime);
  }

  function toggleFullscreen() {
    if (typeof document === 'undefined') return;
    
    const element = containerElement || videoElement;
    
    if (!document.fullscreenElement) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      }
    }
  }

  function handleVideoClick() {
    if (isMobile) {
      // Double-tap detection for mobile
      const now = Date.now();
      if (now - lastTouchTime < 300) {
        toggleFullscreen();
      } else {
        togglePlay();
      }
      lastTouchTime = now;
    } else {
      togglePlay();
    }
  }

  function handleKeydown(event) {
    // Don't handle if user is typing in an input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    switch (event.code) {
      case 'Space':
        event.preventDefault();
        togglePlay();
        break;
      case 'KeyF':
        event.preventDefault();
        toggleFullscreen();
        break;
      case 'KeyM':
        event.preventDefault();
        if (videoElement) {
          videoElement.muted = !videoElement.muted;
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (videoElement) {
          videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (videoElement) {
          videoElement.currentTime = Math.min(duration, videoElement.currentTime + 10);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        volume = Math.min(1, volume + 0.1);
        if (videoElement) {
          videoElement.volume = volume;
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        volume = Math.max(0, volume - 0.1);
        if (videoElement) {
          videoElement.volume = volume;
        }
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        event.preventDefault();
        const percent = parseInt(event.code.slice(-1)) / 10;
        if (videoElement && duration) {
          videoElement.currentTime = duration * percent;
        }
        break;
    }
  }

  function updateBuffered() {
    if (!videoElement || !videoElement.buffered.length) return;
    
    const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
    buffered = duration ? (bufferedEnd / duration) * 100 : 0;
  }

  function handleProgress() {
    updateBuffered();
  }

  function handleWaiting() {
    isBuffering = true;
  }

  function handleCanPlay() {
    isBuffering = false;
    isLoading = false;
    
    // Detect video quality and update available qualities
    if (videoElement) {
      videoQuality = detectVideoQuality(videoElement);
      qualities = getAvailableQualities(videoElement);
    }
  }

  function changeQuality(quality) {
    selectedQuality = quality;
    showQualityMenu = false;
    
    // Track analytics
    analytics?.changeQuality(quality);
    
    // TODO: Implement actual quality switching with your PocketBase setup
    // Example implementation for your PocketBase system:
    /*
    if (quality !== 'Auto') {
      // Construct URL for specific quality
      const qualityUrl = pb.getFileUrl(data.video, data.video.file, {
        quality: quality.toLowerCase().replace('p', ''), // Convert "720p" to "720"
      });
      
      // Save current time and switch source
      const currentTimeBackup = videoElement.currentTime;
      const wasPlaying = !videoElement.paused;
      
      videoElement.src = qualityUrl;
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement.currentTime = currentTimeBackup;
        if (wasPlaying) {
          videoElement.play();
        }
      }, { once: true });
    } else {
      // Switch back to auto/original quality
      videoElement.src = data.video.url;
    }
    */
    
    console.log(`Quality changed to: ${quality}`);
    // Show a temporary notification
    if (typeof window !== 'undefined') {
      const notification = document.createElement('div');
      notification.textContent = `Quality: ${quality}`;
      notification.className = 'fixed top-20 right-4 bg-black/80 text-white px-4 py-2 rounded-lg z-50';
      document.body.appendChild(notification);
      setTimeout(() => document.body.removeChild(notification), 2000);
    }
  }

  function goBack() {
    goto('/home');
  }

  function changePlaybackRate(rate) {
    playbackRate = rate;
    if (videoElement) {
      videoElement.playbackRate = rate;
    }
    analytics?.trackEvent('playback_rate_change', { rate });
  }

  // Reactive statements
  $: if (videoElement && volume !== undefined) {
    videoElement.volume = volume;
  }
</script>

<svelte:head>
  <title>{data.video.name} - Video Player</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<div bind:this={containerElement} class="min-h-screen bg-black text-white relative">
  <!-- Header -->
  <header 
    class="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/75 to-transparent backdrop-blur-sm transition-all duration-300"
    class:opacity-0={!showControls && isPlaying && !isMobile}
    class:pointer-events-none={!showControls && isPlaying && !isMobile}
  >
    <div class="flex items-center justify-between p-4">
      <div class="flex items-center gap-4">
        <button 
          on:click={goBack}
          class="p-2 hover:bg-white/20 rounded-lg transition-colors"
          title="Go back"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        
        <div class="min-w-0">
          <h1 class="text-lg font-semibold truncate max-w-md">{data.video.name}</h1>
          <div class="flex items-center gap-4 text-sm text-gray-300">
            <span>{formatFileSize(data.video.size)}</span>
            <span>{data.video.mime_type}</span>
            {#if videoQuality !== 'Unknown'}
              <span class="bg-white/20 px-2 py-1 rounded text-xs">{videoQuality}</span>
            {/if}
            {#if data.video.owner}
              <span>by {data.video.owner.name || data.video.owner.email}</span>
            {/if}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Quality Selector -->
        <div class="relative quality-menu">
          <button 
            on:click={() => showQualityMenu = !showQualityMenu}
            class="bg-black/50 border border-white/20 rounded px-3 py-1 text-sm hover:bg-white/20 transition-colors flex items-center gap-2"
            title="Video quality"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {selectedQuality}
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {#if showQualityMenu}
            <div class="absolute top-full right-0 mt-2 bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg min-w-32 py-1 z-10">
              {#each qualities as quality}
                <button
                  on:click={() => changeQuality(quality)}
                  class="w-full px-3 py-2 text-left text-sm hover:bg-white/20 transition-colors flex items-center justify-between {selectedQuality === quality ? 'bg-white/20' : ''}"
                >
                  {quality}
                  {#if selectedQuality === quality}
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Playback Rate -->
        <select 
          bind:value={playbackRate}
          on:change={() => changePlaybackRate(playbackRate)}
          class="bg-black/50 border border-white/20 rounded px-2 py-1 text-sm hover:bg-white/20 transition-colors"
          title="Playback speed"
        >
          <option value={0.5}>0.5x</option>
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>

        <!-- Picture-in-Picture -->
        {#if !isMobile && pipSupported}
          <button 
            on:click={() => requestPictureInPicture(videoElement)}
            class="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Picture-in-Picture"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2M7 4h10M7 4l-4 4v12a2 2 0 002 2h14a2 2 0 002-2V8l-4-4M11 9h2v2h-2V9z" />
            </svg>
          </button>
        {/if}

        <button 
          on:click={toggleFullscreen}
          class="p-2 hover:bg-white/20 rounded-lg transition-colors"
          title="Toggle fullscreen (F)"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if isFullscreen}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
            {:else}
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            {/if}
          </svg>
        </button>
      </div>
    </div>
  </header>

  <!-- Video Player -->
  <div class="relative w-full h-screen flex items-center justify-center">
    {#if videoError}
      <div class="text-center">
        <div class="text-6xl mb-4">❌</div>
        <h2 class="text-2xl font-bold mb-2">Error Loading Video</h2>
        <p class="text-gray-300 mb-4">{videoError}</p>
        <button 
          on:click={goBack}
          class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Go Back
        </button>
      </div>
    {:else}
      <video
        bind:this={videoElement}
        src={data.video.url}
        class="max-w-full max-h-full cursor-pointer"
        on:loadstart={() => { isLoading = true; isBuffering = false; }}
        on:canplay={handleCanPlay}
        on:error={(e) => {
          console.error('Video error:', e.detail || e);
          videoError = 'Failed to load video. Please check your connection and try again.';
          isLoading = false;
        }}
        on:timeupdate={() => {
          currentTime = videoElement.currentTime;
          updateBuffered();
          
          // Auto-save progress every 30 seconds
          if (Math.floor(currentTime) % 30 === 0 && duration > 0) {
            saveVideoProgress(data.video.id, currentTime, duration);
          }
        }}
        on:durationchange={() => {
          duration = videoElement.duration;
          updateBuffered();
        }}
        on:play={() => isPlaying = true}
        on:pause={() => isPlaying = false}
        on:volumechange={() => volume = videoElement.volume}
        on:progress={handleProgress}
        on:waiting={handleWaiting}
        on:playing={() => isBuffering = false}
        on:click={handleVideoClick}
        playsinline
        preload="metadata"
      ></video>

      <!-- Loading/Buffering Overlay -->
      {#if isLoading || isBuffering}
        <div class="absolute inset-0 flex items-center justify-center bg-black/30">
          <div class="flex flex-col items-center gap-4">
            <div class="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            <p class="text-lg">{isLoading ? 'Loading video...' : 'Buffering...'}</p>
          </div>
        </div>
      {/if}

      <!-- Central Play Button -->
      {#if !isLoading && !isBuffering}
        <div 
          class="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300"
          class:opacity-0={showControls || isPlaying}
        >
          <button 
            on:click={togglePlay}
            class="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center pointer-events-auto hover:bg-black/70 transition-all hover:scale-110"
          >
            <svg class="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Controls -->
  {#if !videoError && !isLoading}
    <div 
      class="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/75 to-transparent backdrop-blur-sm transition-all duration-300"
      class:opacity-0={!showControls && isPlaying && !isMobile}
      class:pointer-events-none={!showControls && isPlaying && !isMobile}
    >
      <!-- Progress Bar -->
      <div class="px-4 py-2">
        <div 
          class="relative w-full h-2 bg-gray-600/50 rounded-full cursor-pointer hover:h-3 transition-all group"
          on:click={seekTo}
        >
          <!-- Buffered progress -->
          <div 
            class="absolute h-full bg-gray-400/50 rounded-full"
            style="width: {buffered}%"
          ></div>
          
          <!-- Current progress -->
          <div 
            class="relative h-full bg-white rounded-full"
            style="width: {duration ? (currentTime / duration) * 100 : 0}%"
          >
            <div class="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>
        </div>
      </div>

      <!-- Control Bar -->
      <div class="flex items-center justify-between px-4 py-3 gap-4">
        <div class="flex items-center gap-4">
          <!-- Play/Pause -->
          <button 
            on:click={togglePlay}
            class="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Play/Pause (Space)"
          >
            {#if isPlaying}
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            {:else}
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            {/if}
          </button>

          <!-- Time Display -->
          <div class="text-sm text-gray-300 min-w-max font-mono">
            {formatTime(currentTime)} / {formatTime(duration || 0)}
          </div>
        </div>

        <div class="flex items-center gap-4">
          <!-- Volume Control -->
          <div class="flex items-center gap-2">
            <button 
              on:click={() => {
                if (videoElement) {
                  videoElement.muted = !videoElement.muted;
                }
              }}
              class="p-2 hover:bg-white/20 rounded-lg transition-colors"
              title="Mute/Unmute (M)"
            >
              {#if videoElement?.muted || volume === 0}
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              {:else if volume > 0.5}
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              {:else}
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                </svg>
              {/if}
            </button>
            
            {#if !isMobile}
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                bind:value={volume}
                on:input={() => {
                  if (videoElement) {
                    videoElement.volume = volume;
                    if (videoElement.muted && volume > 0) {
                      videoElement.muted = false;
                    }
                  }
                }}
                class="w-20 accent-white"
              />
            {/if}
          </div>

          <!-- Fullscreen -->
          <button 
            on:click={toggleFullscreen}
            class="p-2 hover:bg-white/20 rounded-lg transition-colors"
            title="Fullscreen (F)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {#if isFullscreen}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
              {:else}
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              {/if}
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Keyboard Shortcuts Help -->
  {#if !isMobile}
    <div class="fixed bottom-4 right-4 text-xs text-gray-400 opacity-75">
      <div>Space: Play/Pause</div>
      <div>F: Fullscreen</div>
      <div>M: Mute</div>
      <div>←→: Seek ±10s</div>
      <div>↑↓: Volume ±10%</div>
      <div>1-9: Jump to 10%-90%</div>
    </div>
  {/if}
</div>

<style>
  video::-webkit-media-controls {
    display: none !important;
  }
  
  video {
    outline: none;
  }
</style>