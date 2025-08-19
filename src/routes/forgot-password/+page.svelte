<script>
	import { CheckCircle, XCircle, Mail, Lock, Eye, EyeOff, AlertCircle, ExternalLink } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import logo from '$lib/images/Blogo.webp';
	import Tlogo from '$lib/images/BTlogo.webp';
	
	export let data;
	export let form;
	
	let showPassword = false;
	let showConfirmPassword = false;
	let isSubmitting = false;
	
	// Check if we have a token from query parameter
	$: token = $page.url.searchParams.get('token');
	$: hasToken = token && token.length > 10; // Reset tokens are longer
	$: isRequestForm = !hasToken;
	$: isResetForm = hasToken;
	
	// Fixed logic for success states
	$: emailSent = data.success && isRequestForm; // Email sent when success and no token (request form)
	$: passwordReset = data.success && isResetForm; // Password reset when success and has token (reset form)
	
	// Debug logging
	$: console.log('Debug:', { 
		hasToken, 
		isRequestForm,
		isResetForm,
		dataSuccess: data.success, 
		emailSent, 
		passwordReset, 
		token: token?.substring(0, 10) + '...' 
	});
	
	// Form validation for email
	$: isEmailValid = form?.email ? isValidEmail(form.email) : true;
	
	function isValidEmail(email) {
		const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
		return emailRegex.test(email);
	}

	// Function to open default email client
	function openMail() {
		window.open('mailto:', '_blank');
	}
</script>

<div class="bg-gray-300 min-h-screen flex items-center justify-center py-12 px-4">
	<div class="w-full max-w-sm sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-2xl" style="max-width: 32rem;">

		{#if emailSent}
			<!-- Email Sent Success State -->
			<div class="bg-white rounded-2xl shadow-xl p-8">
				<div class="flex flex-col items-center space-y-4 text-center">
					<div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
						<CheckCircle size={32} class="text-green-600" />
					</div>
					<h1 class="text-2xl font-bold text-gray-900">Reset Link Sent!</h1>
					<p class="text-gray-600">{data.message}</p>
					<p class="text-sm text-gray-500">Check your email for the reset link.</p>
					
					<div class="flex flex-col sm:flex-row gap-3 mt-6">
						<button
							on:click={openMail}
							class="bg-black hover:bg-gray-900 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
						>
							<Mail size={20} />
							Open Mail
						</button>
						<a
							href="/forgot-password"
							class="border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-lg transition-colors text-center"
						>
							Send Another
						</a>
					</div>
				</div>
			</div>
		{:else if passwordReset}
			<!-- Password Reset Success State -->
			<div class="bg-white rounded-2xl shadow-xl p-8">
				<div class="flex flex-col items-center space-y-4 text-center">
					<div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
						<CheckCircle size={32} class="text-green-600" />
					</div>
					<h1 class="text-2xl font-bold text-gray-900">Password Updated!</h1>
					<p class="text-gray-600">{data.message}</p>
					<p class="text-sm text-gray-500 mt-4">You can now sign in with your new password.</p>
					<a href="/login" class="mt-4 bg-black hover:bg-gray-900 text-white font-medium py-3 px-6 rounded-lg transition-colors">
						Go to Login
					</a>
				</div>
			</div>
		{:else if data.error}
			<!-- Error State -->
			<div class="bg-white rounded-2xl shadow-xl p-8">
				<div class="flex flex-col items-center space-y-4 text-center">
					<div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
						<XCircle size={32} class="text-red-600" />
					</div>
					<h1 class="text-2xl font-bold text-gray-900">
						{hasToken ? 'Reset Failed' : 'Request Failed'}
					</h1>
					<p class="text-gray-600">{data.message}</p>
					<a href="/forgot-password" class="mt-4 text-blue-600 hover:text-blue-700 font-medium">
						Try Again
					</a>
				</div>
			</div>
		{:else}
			<!-- Form State -->
			<div class="bg-white rounded-2xl shadow-xl p-8">
				{#if isRequestForm}
					<!-- Logo and Title for Email Form -->
					<div class="text-center mb-8">
						<div class="flex content-center mx-auto w-38 mb-4 center">
							<img src={logo} alt="Logo" class="w-48 object-contain" />
						</div>
						<div class="flex text-center items-center justify-center mb-4">
							<h1 class="text-4xl">forgot password?</h1>
						</div>
						<p class="text-gray-600">
							Enter your email address and we'll send you a link to reset your password.
						</p>
					</div>
				{:else}
					<!-- Reset Password Title -->
					<div class="text-center mb-8">
						<div class="flex content-center mx-auto w-38 mb-4 center">
							<img src={logo} alt="Logo" class="w-48 object-contain" />
						</div>
						<h1 class="text-2xl font-bold text-gray-900 mb-2">Reset Password</h1>
						<p class="text-gray-600">Enter your new password below.</p>
					</div>
				{/if}

				{#if form?.error}
					<div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
						<AlertCircle size={20} class="text-red-600 flex-shrink-0" />
						<p class="text-red-800 text-sm">{form.message}</p>
					</div>
				{/if}

				{#if isRequestForm}
					<!-- Password Reset Request Form -->
					<form method="POST" action="?/request" use:enhance={() => {
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
						};
					}}>
						<div class="space-y-6">
							<div>
								<label for="email" class="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
									<Mail size={16} class="text-gray-600" />
									Email Address
								</label>
								<div class="relative">
									<input
										type="email"
										id="email"
										name="email"
										required
										class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors {form?.email && !isEmailValid ? 'border-red-500' : ''}"
										placeholder="Enter your email"
										value={form?.email || ''}
										disabled={isSubmitting}
									/>
								</div>
								{#if form?.email && !isEmailValid}
									<p class="mt-1 text-sm text-red-600">Please enter a valid email address</p>
								{/if}
							</div>

							<button
								type="submit"
								disabled={isSubmitting}
								class="w-full bg-black text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-900 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
							>
								{#if isSubmitting}
									<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
									Sending...
								{:else}
									<Mail size={20} />
									Send Reset Link
								{/if}
							</button>
						</div>
					</form>
				{:else}
					<!-- Password Reset Form -->
					<form method="POST" action="?/reset" use:enhance={() => {
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
						};
					}}>
						<input type="hidden" name="token" value={token} />
						
						<div class="space-y-6">
							<div>
								<label for="password" class="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
									<Lock size={16} class="text-gray-600" />
									New Password
								</label>
								<div class="relative">
									<input
										type={showPassword ? 'text' : 'password'}
										id="password"
										name="password"
										required
										minlength="8"
										class="w-full px-4 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
										placeholder="Enter new password"
										disabled={isSubmitting}
									/>
									<button
										type="button"
										class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
										on:click={() => showPassword = !showPassword}
										disabled={isSubmitting}
									>
										{#if showPassword}
											<EyeOff size={20} />
										{:else}
											<Eye size={20} />
										{/if}
									</button>
								</div>
							</div>

							<div>
								<label for="passwordConfirm" class="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
									<Lock size={16} class="text-gray-600" />
									Confirm New Password
								</label>
								<div class="relative">
									<input
										type={showConfirmPassword ? 'text' : 'password'}
										id="passwordConfirm"
										name="passwordConfirm"
										required
										minlength="8"
										class="w-full px-4 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
										placeholder="Confirm new password"
									disabled={isSubmitting}
									/>
									<button
										type="button"
										class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
										on:click={() => showConfirmPassword = !showConfirmPassword}
										disabled={isSubmitting}
									>
										{#if showConfirmPassword}
											<EyeOff size={20} />
										{:else}
											<Eye size={20} />
										{/if}
									</button>
								</div>
							</div>

							<button
								type="submit"
								disabled={isSubmitting}
								class="w-full bg-black text-white py-3 px-4 rounded-lg font-medium hover:bg-gray-900 focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
							>
								{#if isSubmitting}
									<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
									Updating...
								{:else}
									<Lock size={20} />
									Update Password
								{/if}
							</button>
						</div>
					</form>
				{/if}

				<div class="mt-6 text-center">
					<a href="/login" class="text-blue-600 hover:text-blue-700 font-medium text-sm">
						Back to Login
					</a>
				</div>
			</div>

			<!-- Terms and Privacy -->
			<div class="mt-6 text-center">
				<p class="text-xs text-gray-500">
					By using our service, you agree to our
					<a href="/terms" class="text-blue-600 hover:text-blue-700">Terms of Service</a>
					and
					<a href="/privacy" class="text-blue-600 hover:text-blue-700">Privacy Policy</a>
				</p>
			</div>
		{/if}
	</div>
</div>