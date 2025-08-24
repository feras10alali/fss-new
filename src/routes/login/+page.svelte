<!-- src/routes/login/+page.svelte -->
<script>
	import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-svelte';
	import logo from '$lib/images/Blogo.webp';
	import Tlogo from '$lib/images/BTlogo.webp';
	import { page } from '$app/stores';

	// Form data
	let formData = {
		email: '',
		password: ''
	};

	// UI state
	let showPassword = false;
	let isLoading = false;
	let errors = {};
	let successMessage = '';

	// Check for OAuth errors from URL params
	$: if ($page.url.searchParams.get('error') === 'oauth_failed') {
		errors.general = 'Authentication failed. Please try again.';
	}

	// Form validation
	$: isFormValid = formData.email.trim() !== '' && 
					 formData.password.length >= 1 &&
					 isValidEmail(formData.email);

	// Email validation
	function isValidEmail(email) {
		const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
		return emailRegex.test(email);
	}

	// Real-time validation
	function validateField(field, value) {
		errors[field] = '';
		
		switch (field) {
			case 'email':
				if (!value.trim()) {
					errors[field] = 'Email is required';
				} else if (!isValidEmail(value)) {
					errors[field] = 'Please enter a valid email address';
				}
				break;
			
			case 'password':
				if (!value) {
					errors[field] = 'Password is required';
				}
				break;
		}
		
		errors = { ...errors };
	}

	// Handle form submission
	const handleSubmit = async (event) => {
		event.preventDefault();

		// Validate form before submission
		if (!isFormValid) {
			return;
		}

		isLoading = true;
		errors = {};
		successMessage = '';

		try {
			const res = await fetch('/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ 
					email: formData.email.toLowerCase().trim(), 
					password: formData.password.trim() 
				})
			});

			const data = await res.json();

			if (res.ok) {
				successMessage = 'Login successful! Redirecting...';
				// Small delay to show success message
				setTimeout(() => {
					window.location.href = '/home';
				}, 1000);
			} else {
				errors.general = data.error || 'Login failed';
			}
		} catch (error) {
			console.error('Login error:', error);
			errors.general = 'Network error. Please try again.';
		} finally {
			isLoading = false;
		}
	};

	// Handle OAuth login
	const handleOAuthLogin = (provider) => {
		window.location.href = `/login/${provider}`;
	};
</script>

<div class="bg-gray-300 min-h-screen flex items-center justify-center py-12 px-4">
	<div class="w-full max-w-sm sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-2xl" style="max-width: 32rem;">

		<!-- Login Form -->
		<div class="bg-white rounded-2xl shadow-xl p-8">
			<div class="text-center mb-8">
				<div class="flex content-center mx-auto w-38 mb-4 center">
					<img src={logo} alt="Logo" class="w-48 object-contain" />
				</div>
				<div class="flex text-center items-center justify-center">
					<h1 class="text-4xl">welcome back to</h1>
					<img src={Tlogo} alt="text logo" class="h-8 mb-0 mt-2 ml-2.5">
				</div>
			</div>

			<!-- OAuth Buttons -->
			<div class="space-y-3 mb-6">
				<!-- Google Sign In -->
				<button
					type="button"
					on:click={() => handleOAuthLogin('google')}
					class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:text-white bg-white hover:bg-blue-500 active:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 font-medium"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
						<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
						<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
						<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
						<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
					</svg>
					Continue with Google
				</button>

				<!-- GitHub Sign In -->
				<button
					type="button"
					on:click={() => handleOAuthLogin('github')}
					class="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:text-white bg-white hover:bg-gray-600 focus:ring-2 focus:ring-gray-600 focus:ring-offset-2 transition-all duration-200 font-medium"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
					</svg>
					Continue with GitHub
				</button>
			</div>

			<!-- Divider -->
			<div class="relative my-6">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-300"></div>
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-white text-gray-500">Or continue with email</span>
				</div>
			</div>

			<!-- Success Message -->
			{#if successMessage}
				<div class="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
					<div class="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
					<p class="text-green-800 text-sm">{successMessage}</p>
				</div>
			{/if}

			<!-- General Error -->
			{#if errors.general}
				<div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
					<AlertCircle size={20} class="text-red-600 flex-shrink-0" />
					<p class="text-red-800 text-sm">{errors.general}</p>
				</div>
			{/if}

			<form on:submit={handleSubmit} class="space-y-6">
				
				<!-- Email Field -->
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
						<Mail size={16} class="text-gray-600" />
						Email Address
					</label>
					<div class="relative">
						<input
							id="email"
							name="email"
							type="email"
							bind:value={formData.email}
							on:blur={() => validateField('email', formData.email)}
							on:input={() => errors.email = ''}
							placeholder="Enter your email"
							class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors {errors.email ? 'border-red-500' : ''}"
							disabled={isLoading}
						/>
					</div>
					{#if errors.email}
						<p class="mt-1 text-sm text-red-600">{errors.email}</p>
					{/if}
				</div>

				<!-- Password Field -->
				<div>
					<label for="password" class="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
						<Lock size={16} class="text-gray-600" />
						Password
					</label>
					<div class="relative">
						<input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							bind:value={formData.password}
							on:blur={() => validateField('password', formData.password)}
							on:input={() => errors.password = ''}
							placeholder="Enter your password"
							class="w-full px-4 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors {errors.password ? 'border-red-500' : ''}"
							disabled={isLoading}
						/>
						<button
							type="button"
							on:click={() => showPassword = !showPassword}
							class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
							disabled={isLoading}
						>
							{#if showPassword}
								<EyeOff size={20} />
							{:else}
								<Eye size={20} />
							{/if}
						</button>
					</div>
					{#if errors.password}
						<p class="mt-1 text-sm text-red-600">{errors.password}</p>
					{/if}
				</div>

				<!-- Forgot Password -->
				<div class="text-right">
					<a href="/forgot-password" class="text-sm text-blue-600 hover:text-blue-700 transition-colors">
						Forgot your password?
					</a>
				</div>

				<!-- Submit Button -->
				<button
					type="submit"
					disabled={!isFormValid || isLoading}
					class="w-full bg-black text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-900 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					{#if isLoading}
						<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
						Signing In...
					{:else}
						<LogIn size={20} />
						Sign In
					{/if}
				</button>
			</form>

			<!-- Register Link -->
			<div class="mt-6 text-center">
				<p class="text-gray-600">
					Don't have an account?
					<a href="/register" class="text-blue-600 hover:text-blue-700 font-medium">
						Register here
					</a>
				</p>
			</div>
		</div>

		<!-- Terms and Privacy -->
		<div class="mt-6 text-center">
			<p class="text-xs text-gray-500">
				By signing in, you agree to our
				<a href="/terms" class="text-blue-600 hover:text-blue-700">Terms of Service</a>
				and
				<a href="/privacy" class="text-blue-600 hover:text-blue-700">Privacy Policy</a>
			</p>
		</div>
	</div>
</div>