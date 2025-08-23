import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
    // If user is already logged in, redirect to home
    if (locals.user) {
        throw redirect(302, '/home');
    }
    
    // Return any data you might need for the login page
    return {
        // You can add any server-side data here if needed
    };
}