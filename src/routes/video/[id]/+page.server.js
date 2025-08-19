import { error } from '@sveltejs/kit';

export async function load({ params, locals, url }) {
    // Use the PocketBase instance from hooks that's already authenticated
    const pb = locals.pb;
    const currentUser = locals.user;
    
    try {
        // Check if user is authenticated (from hooks)
        if (!currentUser) {
            throw error(401, 'Authentication required');
        }

        const videoId = params.id;
        
        // Fetch the video file record with expanded user data
        const videoFile = await pb.collection('files').getOne(videoId, {
            expand: 'owner'  // Make sure this matches your schema
        });

        // Check if user has access to this file
        const hasAccess = await checkFileAccess(pb, videoFile, currentUser.id);
        
        if (!hasAccess) {
            throw error(403, 'Access denied');
        }

        // Verify it's actually a video file
        if (!videoFile.mime_type?.startsWith('video/')) {
            throw error(400, 'File is not a video');
        }

        // Get the video URL with token for secure access
        const videoUrl = pb.getFileUrl(videoFile, videoFile.file, {
            // Add query params if needed for token-based access
            thumb: url.searchParams.get('thumb') || ''
        });

        return {
            video: {
                id: videoFile.id,
                name: videoFile.name,
                mime_type: videoFile.mime_type,
                size: videoFile.size,
                url: videoUrl,
                created: videoFile.created,
                updated: videoFile.updated,
                owner: videoFile.expand?.owner || null,
                // Add additional metadata if available
                duration: videoFile.duration,
                resolution: videoFile.resolution,
                bitrate: videoFile.bitrate
            },
            user: currentUser
        };

    } catch (err) {
        console.error('Error loading video:', err);
        
        // Handle specific PocketBase errors
        if (err.status === 404) {
            throw error(404, 'Video not found');
        } else if (err.status === 403) {
            throw error(403, 'Access denied');
        } else if (err.status === 401) {
            throw error(401, 'Authentication required');
        } else if (err.status) {
            throw err;
        }
        
        throw error(500, 'Failed to load video');
    }
}

// Enhanced access checking function
async function checkFileAccess(pb, videoFile, userId) {
    try {
        // Check if user owns the file
        if (videoFile.owner === userId) {
            return true;
        }

        // Check if file is shared directly with user
        const directShare = await pb.collection('shares').getFirstListItem(
            `resource_id = "${videoFile.id}" && resource_type = "file" && shared_with = "${userId}" && is_active = true`,
            { requestKey: null }
        ).catch(() => null);

        if (directShare) {
            return true;
        }

        // Check if parent folder is shared with user (if applicable)
        if (videoFile.parent_folder) {
            const folderShare = await pb.collection('shares').getFirstListItem(
                `resource_id = "${videoFile.parent_folder}" && resource_type = "folder" && shared_with = "${userId}" && is_active = true`,
                { requestKey: null }
            ).catch(() => null);

            if (folderShare) {
                return true;
            }
        }

        // Check if file is publicly accessible (if you have public sharing)
        if (videoFile.is_public) {
            return true;
        }

        return false;

    } catch (error) {
        console.error('Error checking file access:', error);
        return false;
    }
}