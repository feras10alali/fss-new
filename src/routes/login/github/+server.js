// src/routes/login/github/+server.js
import { redirect } from '@sveltejs/kit';
import { 
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET 
} from '$env/static/private';

export async function GET({ url, cookies, locals }) {
    if (locals.user) {
        throw redirect(302, '/home');
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code) {
        // First step: redirect to GitHub OAuth
        const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
        githubAuthUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
        githubAuthUrl.searchParams.set('redirect_uri', `${url.origin}/login/github`);
        githubAuthUrl.searchParams.set('scope', 'user:email');
        githubAuthUrl.searchParams.set('state', crypto.randomUUID());

        throw redirect(302, githubAuthUrl.toString());
    }

    try {
        // Second step: exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('GitHub OAuth: No access token received');
            throw redirect(302, '/login?error=oauth_failed');
        }

        // Get user info from GitHub
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        const githubUser = await userResponse.json();

        // Get user emails
        const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        const emails = await emailResponse.json();
        const primaryEmail = emails.find(email => email.primary)?.email || githubUser.email;

        // Here you would typically:
        // 1. Check if user exists in PocketBase
        // 2. Create user if doesn't exist
        // 3. Set authentication cookie
        // For now, redirecting with user data (you'll need to implement PocketBase integration)
        
        console.log('GitHub OAuth successful:', {
            id: githubUser.id,
            login: githubUser.login,
            email: primaryEmail,
            name: githubUser.name,
            avatar: githubUser.avatar_url
        });

        // TODO: Integrate with PocketBase
        // For now, just redirect to home
        throw redirect(302, '/home');

    } catch (error) {
        console.error('GitHub OAuth error:', error);
        throw redirect(302, '/login?error=oauth_failed');
    }
}