import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
import { error, fail, redirect } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

export async function load({ url }) {
    // Get token from query parameter
    const token = url.searchParams.get('token');
    
    // Validate token format (PocketBase tokens are typically longer)
    const validToken = token && token.length > 10 ? token : null;

    // Return the token if found, otherwise this is a request form
    return {
        token: validToken,
        success: false,
        error: false,
        message: ''
    };
}

export const actions = {
    // Action for requesting password reset
    request: async ({ request }) => {
        const data = await request.formData();
        const email = data.get('email');

        if (!email) {
            return fail(400, {
                error: true,
                message: 'Email is required',
                email
            });
        }

        // Clean and normalize email
        const cleanEmail = email.toLowerCase().trim();

        try {
            const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
            
            // Request password reset
            await pb.collection('users').requestPasswordReset(cleanEmail);
            
            console.log('🔍 PASSWORD_RESET: Reset email sent to:', cleanEmail);
            
            return {
                success: true,
                message: 'If an account with that email exists, we\'ve sent you a password reset link.',
                email: cleanEmail
            };
            
        } catch (err) {
            console.error('🔍 PASSWORD_RESET: Request failed:', err);
            
            // Don't reveal if email exists or not for security
            return {
                success: true,
                message: 'If an account with that email exists, we\'ve sent you a password reset link.',
                email: email
            };
        }
    },

    // Action for resetting password with token
    reset: async ({ request, url }) => {
        const data = await request.formData();
        let token = data.get('token');
        
        // If no token in form data, get it from query parameter
        if (!token) {
            token = url.searchParams.get('token');
        }
        
        const password = data.get('password');
        const passwordConfirm = data.get('passwordConfirm');

        // Validation
        if (!token) {
            return fail(400, {
                error: true,
                message: 'Reset token is missing'
            });
        }

        if (!password || !passwordConfirm) {
            return fail(400, {
                error: true,
                message: 'Both password fields are required'
            });
        }

        // Clean and validate passwords
        const cleanPassword = password.trim();
        const cleanPasswordConfirm = passwordConfirm.trim();

        if (cleanPassword.length < 8) {
            return fail(400, {
                error: true,
                message: 'Password must be at least 8 characters long'
            });
        }

        if (cleanPassword !== cleanPasswordConfirm) {
            return fail(400, {
                error: true,
                message: 'Passwords do not match'
            });
        }

        try {
            const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
            
            // Confirm password reset
            await pb.collection('users').confirmPasswordReset(
                token,
                cleanPassword,
                cleanPasswordConfirm
            );
            
            console.log('🔍 PASSWORD_RESET: Password reset successful');
            
            return {
                success: true,
                message: 'Your password has been updated successfully!'
            };
            
        } catch (err) {
            console.error('🔍 PASSWORD_RESET: Reset failed:', err);
            
            let message = 'Password reset failed. The link may be expired or invalid.';
            
            // Handle specific PocketBase errors
            if (err.status === 400) {
                if (err.response?.message) {
                    message = err.response.message;
                }
            }
            
            return fail(400, {
                error: true,
                message
            });
        }
    }
};