// src/routes/login/google/+server.js
import { redirect } from '@sveltejs/kit';
import { 
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET 
} from '$env/static/private';

export async function GET({ url, cookies, locals }) {
    if (locals.user) {
        throw redirect(302, '/home');
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
        // First step: redirect to Google OAuth
        const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        googleAuthUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        googleAuthUrl.searchParams.set('redirect_uri', `${url.origin}/login/google`);
        googleAuthUrl.searchParams.set('response_type', 'code');
        googleAuthUrl.searchParams.set('scope', 'openid email profile');
        googleAuthUrl.searchParams.set('state', crypto.randomUUID());

        throw redirect(302, googleAuthUrl.toString());
    }

    try {
        // Second step: exchange code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: `${url.origin}/login/google`,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('Google OAuth: No access token received');
            throw redirect(302, '/login?error=oauth_failed');
        }

        // Get user info from Google
        const userResponse = await fetch(
            `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`
        );

        const googleUser = await userResponse.json();

        // Here you would typically:
        // 1. Check if user exists in PocketBase
        // 2. Create user if doesn't exist
        // 3. Set authentication cookie
        // For now, redirecting with user data (you'll need to implement PocketBase integration)
        
        console.log('Google OAuth successful:', {
            id: googleUser.id,
            email: googleUser.email,
            name: googleUser.name,
            picture: googleUser.picture,
            verified_email: googleUser.verified_email
        });

        // TODO: Integrate with PocketBase
        // For now, just redirect to home
        throw redirect(302, '/home');

    } catch (error) {
        console.error('Google OAuth error:', error);
        throw redirect(302, '/login?error=oauth_failed');
    }
}