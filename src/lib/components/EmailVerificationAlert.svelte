<!-- EmailVerificationAlert.svelte -->
<script>
  import { onMount } from 'svelte';
  import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
  import PocketBase from 'pocketbase';

  export let user;
  
  const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
  
  let isVisible = false;
  let isResending = false;
  let resendMessage = '';
  let resendError = '';

  // Check if email is verified
  $: isEmailVerified = user?.verified
  $: shouldShow = !isEmailVerified && user;

  onMount(() => {
    // Load auth from cookie
    pb.authStore.loadFromCookie(document.cookie);
    
    // Show alert after component mounts if needed
    if (shouldShow) {
      setTimeout(() => {
        isVisible = true;
      }, 500);
    }
  });

  async function resendVerificationEmail() {
    if (isResending) return;

    isResending = true;
    resendMessage = '';
    resendError = '';

    try {
        // Method 1: Try using server action first (recommended)
        const response = await fetch('?/resendVerification', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            email: user.email
        })
        });

        const result = await response.json();
        
        if (result.type === 'success') {
        resendMessage = result.message || 'Verification email sent! Check your inbox and spam folder.';
        } else {
        throw new Error(result.error || 'Failed to send verification email');
        }
        
    } catch (error) {
        console.error('Server action failed, trying direct PocketBase call:', error);
        
        // Method 2: Fallback to direct PocketBase call
        try {
        // Ensure we have a fresh auth token
        pb.authStore.loadFromCookie(document.cookie);
        
        // Try the direct API call with proper headers
        const response = await fetch(`${PUBLIC_POCKETBASE_URL}/api/collections/users/request-verification`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'Authorization': pb.authStore.token ? `Bearer ${pb.authStore.token}` : ''
            },
            body: JSON.stringify({
            email: user.email
            })
        });

        if (response.ok || response.status === 204) {
            resendMessage = 'Verification email sent! Check your inbox and spam folder.';
        } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        } catch (pbError) {
        console.error('Direct PocketBase call also failed:', pbError);
        resendError = 'Failed to send verification email. Please try refreshing the page and try again.';
        }
    }

    // Hide messages after 5 seconds
    setTimeout(() => {
        resendMessage = '';
        resendError = '';
    }, 5000);

    isResending = false;
    }

  function dismissAlert() {
    isVisible = false;
  }

  function openEmailApp() {
    // Try to detect email provider and open appropriate app
    const email = user?.email || '';
    const domain = email.split('@')[1]?.toLowerCase();
    
    let emailUrl = 'mailto:';
    
    // Common email providers
    switch (domain) {
      case 'gmail.com':
        emailUrl = 'https://mail.google.com/mail/u/0/#inbox';
        break;
      case 'outlook.com':
      case 'hotmail.com':
      case 'live.com':
        emailUrl = 'https://outlook.live.com/mail/0/inbox';
        break;
      case 'yahoo.com':
        emailUrl = 'https://mail.yahoo.com/';
        break;
      case 'icloud.com':
        emailUrl = 'https://www.icloud.com/mail/';
        break;
      default:
        // For other providers, try to open default mail app
        emailUrl = 'mailto:';
    }
    
    window.open(emailUrl, '_blank');
  }
</script>

{#if shouldShow && isVisible}
  <div class="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md mx-4 animate-slide-down anim">
    <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg shadow-lg">
      <div class="flex items-start">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3 flex-1">
          <h3 class="text-sm font-medium text-red-800">
            Email verification required
          </h3>
          <div class="mt-2 text-sm text-red-700">
            <p>Please verify your email address to access all features. Check your inbox for a verification email.</p>
          </div>
          
          <!-- Success/Error Messages -->
          {#if resendMessage}
            <div class="mt-3 p-2 bg-green-100 border border-green-200 rounded text-sm text-green-700">
              ✅ {resendMessage}
            </div>
          {/if}
          
          {#if resendError}
            <div class="mt-3 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
              ❌ {resendError}
            </div>
          {/if}
          
          <!-- Action Buttons -->
          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50"
              on:click={openEmailApp}
            >
              <svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Go to Mail
            </button>
            
            <button
              type="button"
              class="inline-flex items-center px-3 py-2 border border-red-300 text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors disabled:opacity-50"
              on:click={resendVerificationEmail}
              disabled={isResending}
            >
              {#if isResending}
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              {:else}
                <svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Resend Email
              {/if}
            </button>
          </div>
        </div>
        
        <!-- Dismiss Button -->
        <div class="ml-auto pl-3">
          <div class="-mx-1.5 -my-1.5">
            <button
              type="button"
              class="inline-flex rounded-md p-1.5 text-red-400 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600 transition-colors"
              on:click={dismissAlert}
            >
              <span class="sr-only">Dismiss</span>
              <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-down {
    from {
      opacity: 0;
      transform: translate(-50%, -20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .animate-slide-down {
    animation: slide-down 0.4s ease-out;
  }
</style>