import { redirect, error } from '@sveltejs/kit';

// Recursive function to fetch shared folder contents
async function fetchSharedFolderContentsRecursively(sharedFolderIds, allShares, pb, userId) {
  const allSharedFiles = [];
  const allSharedFolders = [];
  const processedFolders = new Set();

  console.log('🔍 RECURSIVE_FETCH: Starting with folder IDs:', Array.from(sharedFolderIds));

  // Get all shared folder IDs from shares (direct shares only)
  const directlySharedFolderIds = new Set(
    allShares
      .filter(s => s.resource_type === 'folder')
      .map(s => s.resource_id)
  );

  console.log('🔍 RECURSIVE_FETCH: Directly shared folders:', Array.from(directlySharedFolderIds));

  // Recursive function to fetch all descendants
  async function fetchFolderDescendants(folderIds, inheritedShare = null) {
    for (const folderId of folderIds) {
      if (processedFolders.has(folderId)) {
        continue;
      }
      processedFolders.add(folderId);

      try {
        console.log('🔍 RECURSIVE_FETCH: Processing folder:', folderId);

        // Determine share info for this folder
        let shareInfo = inheritedShare;
        const directShare = allShares.find(s => 
          s.resource_type === 'folder' && s.resource_id === folderId
        );
        
        if (directShare) {
          shareInfo = {
            permission: directShare.permission,
            shared_by: directShare.expand?.owner,
            message: directShare.message || ''
          };
          console.log('🔍 RECURSIVE_FETCH: Using direct share for folder:', folderId);
        } else if (shareInfo) {
          console.log('🔍 RECURSIVE_FETCH: Using inherited share for folder:', folderId);
        } else {
          console.warn('⚠️ RECURSIVE_FETCH: No share info for folder:', folderId);
          continue;
        }

        // Fetch ALL files in this folder (PocketBase will filter based on rules)
        const folderFiles = await pb.collection('files').getList(1, 200, {
          filter: `parent_folder = "${folderId}" && is_deleted = false`,
          expand: 'parent_folder,owner',
          requestKey: null // Disable auto-cancellation
        });

        console.log(`🔍 RECURSIVE_FETCH: Found ${folderFiles.items.length} files in folder ${folderId}`);

        // Add all files with shared metadata
        for (const file of folderFiles.items) {
          allSharedFiles.push({
            ...file,
            shared_with_me: true,
            share_permission: shareInfo.permission,
            shared_by: shareInfo.shared_by,
            share_message: shareInfo.message
          });
        }

        // Fetch ALL subfolders in this folder
        const subFolders = await pb.collection('folders').getList(1, 200, {
          filter: `parent_folder = "${folderId}" && is_deleted = false`,
          expand: 'parent_folder,owner',
          requestKey: null
        });

        console.log(`🔍 RECURSIVE_FETCH: Found ${subFolders.items.length} subfolders in folder ${folderId}`);

        const subFolderIds = [];
        
        // Add all subfolders with shared metadata
        for (const folder of subFolders.items) {
          allSharedFolders.push({
            ...folder,
            shared_with_me: true,
            share_permission: shareInfo.permission,
            shared_by: shareInfo.shared_by,
            share_message: shareInfo.message
          });
          subFolderIds.push(folder.id);
        }

        // Recursively process subfolders with inherited share info
        if (subFolderIds.length > 0) {
          await fetchFolderDescendants(subFolderIds, shareInfo);
        }

      } catch (error) {
        console.error('❌ RECURSIVE_FETCH: Error processing folder:', folderId, error);
      }
    }
  }

  // Start recursive fetch with directly shared folders
  await fetchFolderDescendants(Array.from(sharedFolderIds));

  console.log('🔍 RECURSIVE_FETCH: Final results:', {
    files: allSharedFiles.length,
    folders: allSharedFolders.length,
    processedFolders: processedFolders.size
  });

  return {
    files: allSharedFiles,
    folders: allSharedFolders
  };
}

export async function load({ locals, url }) {
  console.log('🔍 DASHBOARD: Load function called');
  console.log('🔍 DASHBOARD: User from locals:', locals.user ? 'Present' : 'Not present');
  
  if (!locals.user) {
    throw redirect(302, '/login');
  }
  
  console.log('🔍 DASHBOARD: User authenticated:', locals.user.email, 'ID:', locals.user.id);
  
  try {
    if (!locals.pb.authStore.isValid) {
      throw redirect(302, '/login');
    }
    
    if (locals.pb.authStore.model?.id !== locals.user.id) {
      console.log('🔍 DASHBOARD: Auth store user mismatch, refreshing auth');
      try {
        await locals.pb.collection('users').authRefresh();
      } catch (refreshError) {
        console.error('❌ DASHBOARD: Failed to refresh auth:', refreshError);
        throw redirect(302, '/login');
      }
    }
    
    console.log('🔍 DASHBOARD: PocketBase auth model:', locals.pb.authStore.model?.id);

    // Get current folder from URL parameters
    const currentFolderId = url.searchParams.get('folder');
    const isSharedView = url.searchParams.get('view') === 'shared';
    
    console.log('🔍 DASHBOARD: URL params - folder:', currentFolderId, 'isSharedView:', isSharedView);

    // Fetch user's own files
    const files = await locals.pb.collection('files').getList(1, 200, {
      filter: `owner = "${locals.user.id}" && is_deleted = false`,
      sort: '-updated',
      expand: 'parent_folder'
    });
    
    // Fetch user's own folders  
    const folders = await locals.pb.collection('folders').getList(1, 200, {
      filter: `owner = "${locals.user.id}" && is_deleted = false`,
      sort: '-updated',
      expand: 'parent_folder'
    });

    // Fetch shares where current user is the recipient
    const sharedWithMe = await locals.pb.collection('shares').getList(1, 200, {
      filter: `shared_with = "${locals.user.id}" && is_active = true`,
      sort: '-created',
      expand: 'owner'
    });

    console.log('🔍 DASHBOARD: Shares found:', sharedWithMe.items.length);

    // Fetch direct shared resources first
    const directSharedFiles = [];
    const directSharedFolders = [];
    const sharedFolderIds = new Set();

    for (const share of sharedWithMe.items) {
      try {
        if (share.resource_type === 'file') {
          const sharedFile = await locals.pb.collection('files').getOne(share.resource_id, {
            expand: 'parent_folder,owner'
          });
          if (!sharedFile.is_deleted) {
            directSharedFiles.push({
              ...sharedFile,
              shared_with_me: true,
              share_permission: share.permission,
              shared_by: share.expand?.owner || null,
              share_message: share.message || ''
            });
          }
        } else if (share.resource_type === 'folder') {
          const sharedFolder = await locals.pb.collection('folders').getOne(share.resource_id, {
            expand: 'parent_folder,owner'
          });
          if (!sharedFolder.is_deleted) {
            directSharedFolders.push({
              ...sharedFolder,
              shared_with_me: true,
              share_permission: share.permission,
              shared_by: share.expand?.owner || null,
              share_message: share.message || ''
            });
            sharedFolderIds.add(share.resource_id);
          }
        }
      } catch (resourceError) {
        console.warn('⚠️ DASHBOARD: Could not fetch shared resource:', share.resource_id, resourceError);
      }
    }

    // Recursively fetch ALL contents of shared folders
    let allSharedFiles = [...directSharedFiles];
    let allSharedFolders = [...directSharedFolders];

    if (sharedFolderIds.size > 0) {
      console.log('🔍 DASHBOARD: Fetching recursive contents for shared folders...');
      const recursiveContents = await fetchSharedFolderContentsRecursively(
        sharedFolderIds,
        sharedWithMe.items,
        locals.pb,
        locals.user.id
      );

      // Merge with direct shares (avoid duplicates)
      const existingFileIds = new Set(allSharedFiles.map(f => f.id));
      const existingFolderIds = new Set(allSharedFolders.map(f => f.id));

      for (const file of recursiveContents.files) {
        if (!existingFileIds.has(file.id)) {
          allSharedFiles.push(file);
        }
      }

      for (const folder of recursiveContents.folders) {
        if (!existingFolderIds.has(folder.id)) {
          allSharedFolders.push(folder);
        }
      }
    }

    console.log('🔍 DASHBOARD: FINAL SHARED COUNTS:');
    console.log('✅ Total shared files:', allSharedFiles.length);
    console.log('✅ Total shared folders:', allSharedFolders.length);

    // Fetch recent activity
    const recentActivity = await locals.pb.collection('recent_activity').getList(1, 10, {
      filter: `user = "${locals.user.id}"`,
      sort: '-created'
    });
    
    // Fetch user's favorites
    const favorites = await locals.pb.collection('favorites').getList(1, 50, {
      filter: `user = "${locals.user.id}"`,
      sort: '-created'
    });

    const availableUsers = await locals.pb.collection('users').getList(1, 50, {
      sort: 'created',
      fields: 'id,email,name'
    });
    
    // Calculate storage usage (basic approximation)
    const totalSize = files.items.reduce((sum, file) => sum + (file.size || 0), 0);
    const storageUsed = (totalSize / (1024 * 1024 * 1024)).toFixed(2); // Convert to GB
    
    console.log('✅ DASHBOARD: Data loaded successfully');
    console.log('✅ DASHBOARD: Files count:', files.items.length);
    console.log('✅ DASHBOARD: Folders count:', folders.items.length);
    console.log('✅ DASHBOARD: Shared files count:', allSharedFiles.length);
    console.log('✅ DASHBOARD: Shared folders count:', allSharedFolders.length);
    console.log('✅ DASHBOARD: Favorites count:', favorites.items.length);
    
    return {
      files: files.items,
      folders: folders.items,
      sharedFiles: allSharedFiles,
      sharedFolders: allSharedFolders,
      recentActivity: recentActivity.items,
      favorites: favorites.items.map(f => f.resource_id),
      availableUsers: availableUsers.items,
      storageUsed: parseFloat(storageUsed),
      storageTotal: 500,
      user: locals.user
    };
    
  } catch (err) {
    console.error('❌ DASHBOARD: Error loading data:', err);
    console.error('❌ DASHBOARD: Error details:', {
      status: err.status,
      message: err.message,
      response: err.response
    });
    
    if (err.status === 401 || err.status === 403) {
      console.log('🔍 DASHBOARD: Authentication error, redirecting to login');
      throw redirect(302, '/login');
    }
    
    if (err.status === 404) {
      throw error(404, 'Resource not found');
    }
    
    if (err.status >= 500) {
      throw error(500, 'Server error: Unable to load data');
    }
    
    throw error(500, 'Failed to load data');
  }
}

// Add server-side actions for file operations
export const actions = {
  createFolder: async ({ request, locals }) => {
    console.log('🔍 CREATE_FOLDER: Action called');
    
    if (!locals.user) {
      console.log('❌ CREATE_FOLDER: No user found');
      throw redirect(302, '/login');
    }

    if (!locals.pb.authStore.isValid) {
      console.log('❌ CREATE_FOLDER: Invalid auth store');
      throw redirect(302, '/login');
    }

    try {
      const data = await request.formData();
      const folderName = data.get('name');
      const parentFolder = data.get('parent_folder') || null;

      console.log('🔍 CREATE_FOLDER: Form data received:', {
        name: folderName,
        parent_folder: parentFolder,
        formDataEntries: Array.from(data.entries())
      });

      if (!folderName) {
        return {
          type: 'error',
          error: 'Folder name is required'
        };
      }

      // Validate parent folder belongs to user if provided
      if (parentFolder) {
        try {
          const parentFolderRecord = await locals.pb.collection('folders').getOne(parentFolder);
          if (parentFolderRecord.owner !== locals.user.id) {
            return {
              type: 'error',
              error: 'Invalid parent folder'
            };
          }
        } catch (parentError) {
          console.error('❌ CREATE_FOLDER: Parent folder validation error:', parentError);
          return {
            type: 'error',
            error: 'Invalid parent folder'
          };
        }
      }

      console.log('🔍 CREATE_FOLDER: Creating folder:', {
        name: folderName,
        owner: locals.user.id,
        parent_folder: parentFolder,
        authUserId: locals.pb.authStore.model?.id
      });

      const folderData = {
        name: folderName,
        owner: locals.user.id,
        is_deleted: false
      };

      // Only add parent_folder if it's not null/empty
      if (parentFolder && parentFolder.trim() !== '') {
        folderData.parent_folder = parentFolder;
      }

      const newFolder = await locals.pb.collection('folders').create(folderData);

      console.log('✅ CREATE_FOLDER: Folder created successfully:', {
        id: newFolder.id,
        name: newFolder.name,
        parent_folder: newFolder.parent_folder
      });

      // Add to recent activity
      try {
        await locals.pb.collection('recent_activity').create({
          user: locals.user.id,
          action: 'create_folder',
          resource_type: 'folder',
          resource_id: newFolder.id,
          resource_name: folderName
        });
      } catch (activityError) {
        console.warn('⚠️ CREATE_FOLDER: Failed to create activity log:', activityError);
      }

      return {
        type: 'success',
        folder: newFolder
      };

    } catch (error) {
      console.error('❌ CREATE_FOLDER: Error:', error);
      console.error('❌ CREATE_FOLDER: Error details:', {
        status: error.status,
        message: error.message,
        response: error.response
      });

      return {
        type: 'error',
        error: error.message || 'Failed to create folder'
      };
    }
  },

   deleteItem: async ({ request, locals }) => {
    console.log('🔍 DELETE_ITEM: Action called');
    
    if (!locals.user) {
      return { type: 'error', error: 'Authentication required' };
    }

    if (!locals.pb.authStore.isValid) {
      return { type: 'error', error: 'Authentication required' };
    }

    try {
      const data = await request.formData();
      const itemId = data.get('item_id');
      const itemType = data.get('item_type');
      const itemName = data.get('item_name');

      console.log('🔍 DELETE_ITEM: Form data received:', {
        item_id: itemId,
        item_type: itemType,
        item_name: itemName,
        user: locals.user.id
      });

      if (!itemId || !itemType) {
        return { type: 'error', error: 'Missing required parameters' };
      }

      // Determine the collection based on item type
      const collection = itemType === 'folder' ? 'folders' : 'files';

      // Verify the item belongs to the user
      try {
        const item = await locals.pb.collection(collection).getOne(itemId);
        if (item.owner !== locals.user.id) {
          return { type: 'error', error: 'You can only delete your own items' };
        }
      } catch (verifyError) {
        console.error('❌ DELETE_ITEM: Item verification error:', verifyError);
        return { type: 'error', error: 'Item not found' };
      }

      // Update the item to set is_deleted = true
      const updatedItem = await locals.pb.collection(collection).update(itemId, {
        is_deleted: true,
        deleted_at: new Date().toISOString()
      });

      console.log('✅ DELETE_ITEM: Item deleted successfully:', {
        id: updatedItem.id,
        name: updatedItem.name,
        type: itemType
      });

      // If it's a folder, recursively delete all contents
      if (itemType === 'folder') {
        try {
          await deleteAllFolderContents(locals.pb, itemId, locals.user.id);
          console.log('✅ DELETE_ITEM: Folder contents deleted recursively');
        } catch (recursiveError) {
          console.warn('⚠️ DELETE_ITEM: Failed to delete some folder contents:', recursiveError);
          // Don't fail the main operation if recursive deletion has issues
        }
      }

      // Add to recent activity
      try {
        await locals.pb.collection('recent_activity').create({
          user: locals.user.id,
          action: 'delete',
          resource_type: itemType,
          resource_id: itemId,
          resource_name: itemName || 'Unknown item'
        });
      } catch (activityError) {
        console.warn('⚠️ DELETE_ITEM: Failed to create activity log:', activityError);
      }

      return {
        type: 'success',
        message: `${itemType === 'folder' ? 'Folder' : 'File'} "${itemName}" moved to trash`,
        item: updatedItem
      };

    } catch (error) {
      console.error('❌ DELETE_ITEM: Error:', error);
      console.error('❌ DELETE_ITEM: Error details:', {
        status: error.status,
        message: error.message,
        response: error.response
      });

      return {
        type: 'error',
        error: error.message || 'Failed to delete item'
      };
    }
  },

  renameItem: async ({ request, locals }) => {
    console.log('🔍 RENAME_ITEM: Action called');
    
    if (!locals.user) {
      return { type: 'error', error: 'Authentication required' };
    }

    if (!locals.pb.authStore.isValid) {
      return { type: 'error', error: 'Authentication required' };
    }

    try {
      const data = await request.formData();
      const itemId = data.get('item_id');
      const itemType = data.get('item_type');
      const newName = data.get('new_name');
      const oldName = data.get('old_name');

      console.log('🔍 RENAME_ITEM: Form data received:', {
        item_id: itemId,
        item_type: itemType,
        new_name: newName,
        old_name: oldName,
        user: locals.user.id
      });

      if (!itemId || !itemType || !newName) {
        return { type: 'error', error: 'Missing required parameters' };
      }

      // Validate new name
      const trimmedName = newName.trim();
      if (!trimmedName) {
        return { type: 'error', error: 'Name cannot be empty' };
      }

      if (trimmedName.length > 255) {
        return { type: 'error', error: 'Name is too long (max 255 characters)' };
      }

      // Check for invalid characters (basic validation)
      const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
      if (invalidChars.test(trimmedName)) {
        return { type: 'error', error: 'Name contains invalid characters' };
      }

      // Determine the collection based on item type
      const collection = itemType === 'folder' ? 'folders' : 'files';

      // Verify the item belongs to the user and get current data
      let currentItem;
      try {
        currentItem = await locals.pb.collection(collection).getOne(itemId);
        if (currentItem.owner !== locals.user.id) {
          return { type: 'error', error: 'You can only rename your own items' };
        }
      } catch (verifyError) {
        console.error('❌ RENAME_ITEM: Item verification error:', verifyError);
        return { type: 'error', error: 'Item not found' };
      }

      // Check if the new name is different from current name
      if (currentItem.name === trimmedName) {
        return { type: 'error', error: 'New name is the same as current name' };
      }

      // Check for duplicate names in the same directory
      try {
        const parentFilter = currentItem.parent_folder ? 
          `parent_folder = "${currentItem.parent_folder}"` : 
          'parent_folder = null || parent_folder = ""';
        
        const duplicateCheck = await locals.pb.collection(collection).getList(1, 1, {
          filter: `name = "${trimmedName}" && ${parentFilter} && owner = "${locals.user.id}" && is_deleted = false && id != "${itemId}"`
        });

        if (duplicateCheck.items && duplicateCheck.items.length > 0) {
          return { 
            type: 'error', 
            error: `A ${itemType} with the name "${trimmedName}" already exists in this location` 
          };
        }
      } catch (duplicateError) {
        console.warn('⚠️ RENAME_ITEM: Could not check for duplicates:', duplicateError);
        // Continue with rename even if duplicate check fails
      }

      // Update the item name
      const updatedItem = await locals.pb.collection(collection).update(itemId, {
        name: trimmedName,
        updated: new Date().toISOString()
      });

      console.log('✅ RENAME_ITEM: Item renamed successfully:', {
        id: updatedItem.id,
        old_name: oldName,
        new_name: updatedItem.name,
        type: itemType
      });

      // Add to recent activity
      try {
        await locals.pb.collection('recent_activity').create({
          user: locals.user.id,
          action: 'rename',
          resource_type: itemType,
          resource_id: itemId,
          resource_name: `"${oldName}" → "${trimmedName}"`
        });
      } catch (activityError) {
        console.warn('⚠️ RENAME_ITEM: Failed to create activity log:', activityError);
      }

      return {
        type: 'success',
        message: `${itemType === 'folder' ? 'Folder' : 'File'} renamed from "${oldName}" to "${trimmedName}"`,
        item: updatedItem
      };

    } catch (error) {
      console.error('❌ RENAME_ITEM: Error:', error);
      console.error('❌ RENAME_ITEM: Error details:', {
        status: error.status,
        message: error.message,
        response: error.response
      });

      return {
        type: 'error',
        error: error.message || 'Failed to rename item'
      };
    }
  },

  uploadFile: async ({ request, locals }) => {
    console.log('🔍 UPLOAD_FILE: Action called');
    
    if (!locals.user) {
      console.log('❌ UPLOAD_FILE: No user found');
      return { type: 'error', error: 'Authentication required' };
    }

    if (!locals.pb.authStore.isValid) {
      console.log('❌ UPLOAD_FILE: Invalid auth store');
      return { type: 'error', error: 'Authentication required' };
    }

    try {
      const data = await request.formData();
      const file = data.get('file');
      const parentFolder = data.get('parent_folder') || null;

      console.log('🔍 UPLOAD_FILE: Form data received:', {
        fileName: file?.name,
        fileSize: file?.size,
        fileType: file?.type,
        parent_folder: parentFolder
      });

      // Validate file exists
      if (!file || file.size === 0) {
        return { type: 'error', error: 'File is required and cannot be empty' };
      }

      // Enhanced file validation (REMOVED ALL SIZE LIMITS)
      const fileName = file.name;
      const fileSize = file.size;
      const mimeType = file.type || 'application/octet-stream';

      // Only basic security checks (no size restrictions)
      const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs'];
      const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
      
      if (dangerousExtensions.includes(fileExtension)) {
        return { 
          type: 'error', 
          error: `File type ${fileExtension} is not allowed for security reasons` 
        };
      }

      // Validate parent folder if provided
      if (parentFolder && parentFolder.trim()) {
        try {
          const parentFolderRecord = await locals.pb.collection('folders').getOne(parentFolder);
          if (parentFolderRecord.owner !== locals.user.id) {
            return { type: 'error', error: 'Invalid parent folder' };
          }
        } catch (parentError) {
          console.error('❌ UPLOAD_FILE: Parent folder validation error:', parentError);
          return { type: 'error', error: 'Parent folder not found' };
        }
      }

      console.log('🔍 UPLOAD_FILE: Processing file:', {
        name: fileName,
        size: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
        type: mimeType,
        owner: locals.user.id,
        parent_folder: parentFolder
      });

      // Prepare file data with optimized settings
      const fileData = {
        name: fileName,
        file: file,
        size: fileSize,
        mime_type: mimeType,
        owner: locals.user.id,
        is_deleted: false,
        upload_date: new Date().toISOString()
      };

      // Add parent folder if specified
      if (parentFolder && parentFolder.trim()) {
        fileData.parent_folder = parentFolder.trim();
      }

      // Create the file record with extended timeout handling
      let newFile;
      try {
        // Set longer timeout for heavy files (if your PocketBase instance supports it)
        const originalTimeout = locals.pb.beforeSend;
        locals.pb.beforeSend = function(url, options) {
          // Increase timeout for file uploads
          if (options.body instanceof FormData) {
            options.signal = AbortSignal.timeout(300000); // 5 minutes timeout
          }
          return originalTimeout?.call(this, url, options) || { url, options };
        };

        newFile = await locals.pb.collection('files').create(fileData);
        
        console.log('✅ UPLOAD_FILE: File created successfully:', {
          id: newFile.id,
          name: newFile.name,
          size: newFile.size,
          parent_folder: newFile.parent_folder
        });

        // Restore original timeout handler
        locals.pb.beforeSend = originalTimeout;

      } catch (createError) {
        console.error('❌ UPLOAD_FILE: Database creation error:', createError);
        
        // Enhanced error handling for different scenarios
        if (createError.name === 'HeadersTimeoutError' || createError.code === 'UND_ERR_HEADERS_TIMEOUT') {
          return { 
            type: 'error', 
            error: `Upload timeout. File "${fileName}" is too large or connection is slow. Please try a smaller file or check your internet connection.` 
          };
        } else if (createError.status === 413) {
          return { type: 'error', error: 'File is too large for the server' };
        } else if (createError.status === 400) {
          return { type: 'error', error: 'Invalid file data: ' + (createError.message || 'Unknown validation error') };
        } else if (createError.status === 403) {
          return { type: 'error', error: 'Permission denied' };
        } else if (createError.message?.includes('fetch failed')) {
          return { 
            type: 'error', 
            error: `Network error during upload. Please check your connection and try again.` 
          };
        }
        
        throw createError; // Re-throw if not handled
      }

      // Add to recent activity (non-blocking, with error handling)
      try {
        await locals.pb.collection('recent_activity').create({
          user: locals.user.id,
          action: 'upload',
          resource_type: 'file',
          resource_id: newFile.id,
          resource_name: fileName,
          details: `Uploaded ${(fileSize / 1024 / 1024).toFixed(2)} MB file`
        });
      } catch (activityError) {
        console.warn('⚠️ UPLOAD_FILE: Failed to create activity log:', activityError);
        // Don't fail the upload if activity logging fails
      }

      // Update user storage statistics (non-blocking, with better error handling)
      try {
        // First check if user_stats collection exists
        const collections = await locals.pb.collections.getList();
        const userStatsExists = collections.items.some(col => col.name === 'user_stats');
        
        if (userStatsExists) {
          const userStats = await locals.pb.collection('user_stats').getList(1, 1, {
            filter: `user = "${locals.user.id}"`
          });
          
          if (userStats.items.length > 0) {
            const stats = userStats.items[0];
            await locals.pb.collection('user_stats').update(stats.id, {
              total_files: (stats.total_files || 0) + 1,
              total_storage: (stats.total_storage || 0) + fileSize,
              last_upload: new Date().toISOString()
            });
          } else {
            await locals.pb.collection('user_stats').create({
              user: locals.user.id,
              total_files: 1,
              total_storage: fileSize,
              last_upload: new Date().toISOString()
            });
          }
          console.log('✅ UPLOAD_FILE: User stats updated successfully');
        } else {
          console.log('ℹ️ UPLOAD_FILE: user_stats collection does not exist, skipping stats update');
        }
      } catch (statsError) {
        console.warn('⚠️ UPLOAD_FILE: Failed to update user stats:', statsError);
        // Don't fail the upload if stats update fails - this is not critical
      }

      return {
        type: 'success',
        file: newFile,
        message: `Successfully uploaded ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
      };

    } catch (error) {
      console.error('❌ UPLOAD_FILE: Unexpected error:', error);
      console.error('❌ UPLOAD_FILE: Error details:', {
        status: error.status,
        message: error.message,
        data: error.data,
        name: error.name,
        code: error.code
      });

      // Enhanced error messages based on error type
      let errorMessage = 'Failed to upload file';
      
      if (error.name === 'HeadersTimeoutError' || error.code === 'UND_ERR_HEADERS_TIMEOUT') {
        errorMessage = 'Upload timeout - file may be too large or connection is slow';
      } else if (error.status === 413) {
        errorMessage = 'File is too large';
      } else if (error.status === 415) {
        errorMessage = 'Unsupported file type';
      } else if (error.status === 507) {
        errorMessage = 'Server storage full';
      } else if (error.message?.includes('fetch failed')) {
        errorMessage = 'Network connection failed during upload';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        type: 'error',
        error: errorMessage
      };
    }
  },

  toggleFavorite: async ({ request, locals }) => {
    console.log('🔍 TOGGLE_FAVORITE: Action called');
    
    if (!locals.user) {
      console.log('❌ TOGGLE_FAVORITE: No user found');
      return {
        type: 'error',
        error: 'Authentication required'
      };
    }

    if (!locals.pb.authStore.isValid) {
      console.log('❌ TOGGLE_FAVORITE: Invalid auth store');
      return {
        type: 'error',
        error: 'Authentication required'
      };
    }

    try {
      const data = await request.formData();
      const resourceId = data.get('resource_id');
      const resourceType = data.get('resource_type');
      const action = data.get('action'); // 'add' or 'remove'

      console.log('🔍 TOGGLE_FAVORITE: Form data received:', {
        resource_id: resourceId,
        resource_type: resourceType,
        action: action,
        user: locals.user.id
      });

      if (!resourceId || !resourceType || !action) {
        return {
          type: 'error',
          error: 'Missing required parameters'
        };
      }

      if (action === 'add') {
        // Add to favorites
        const newFavorite = await locals.pb.collection('favorites').create({
          user: locals.user.id,
          resource_id: resourceId,
          resource_type: resourceType
        });

        console.log('✅ TOGGLE_FAVORITE: Added to favorites:', newFavorite.id);

        return {
          type: 'success',
          action: 'added',
          favorite: newFavorite
        };
      } else if (action === 'remove') {
        // Remove from favorites
        try {
          const favorite = await locals.pb.collection('favorites').getFirstListItem(
            `user = "${locals.user.id}" && resource_id = "${resourceId}" && resource_type = "${resourceType}"`
          );
          
          await locals.pb.collection('favorites').delete(favorite.id);
          
          console.log('✅ TOGGLE_FAVORITE: Removed from favorites:', favorite.id);

          return {
            type: 'success',
            action: 'removed'
          };
        } catch (findError) {
          console.log('⚠️ TOGGLE_FAVORITE: Favorite not found, considering it already removed');
          return {
            type: 'success',
            action: 'removed'
          };
        }
      } else {
        return {
          type: 'error',
          error: 'Invalid action'
        };
      }

    } catch (error) {
      console.error('❌ TOGGLE_FAVORITE: Error:', error);
      console.error('❌ TOGGLE_FAVORITE: Error details:', {
        status: error.status,
        message: error.message,
        response: error.response
      });

      return {
        type: 'error',
        error: error.message || 'Failed to toggle favorite'
      };
    }
  },

  shareResource: async ({ request, locals }) => {
    console.log('🔍 SHARE_RESOURCE: Action called');
    
    if (!locals.user) {
      return { type: 'error', error: 'Authentication required' };
    }

    if (!locals.pb.authStore.isValid) {
      return { type: 'error', error: 'Authentication required' };
    }

    try {
      const data = await request.formData();
      const resourceId = data.get('resource_id');
      const resourceType = data.get('resource_type');
      const sharedWithEmail = data.get('shared_with_email');
      const permission = data.get('permission') || 'view';
      const message = data.get('message') || '';
      const expiresAt = data.get('expires_at') || null;

      console.log('🔍 SHARE_RESOURCE: Form data received:', {
        resource_id: resourceId,
        resource_type: resourceType,
        shared_with_email: sharedWithEmail,
        permission: permission,
        expires_at: expiresAt
      });

      // Validate required fields
      if (!resourceId || !resourceType || !sharedWithEmail) {
        return { type: 'error', error: 'Missing required fields' };
      }

      // Validate resource belongs to user
      const collection = resourceType === 'folder' ? 'folders' : 'files';
      try {
        const resource = await locals.pb.collection(collection).getOne(resourceId);
        if (resource.owner !== locals.user.id) {
          return { type: 'error', error: 'You can only share your own items' };
        }
      } catch (resourceError) {
        console.error('❌ SHARE_RESOURCE: Resource validation error:', resourceError);
        return { type: 'error', error: 'Resource not found' };
      }

      // IMPROVED USER LOOKUP with detailed debugging
      let sharedWithUser = null;
      try {
        console.log('🔍 SHARE_RESOURCE: Searching for user with email:', sharedWithEmail);
        
        // Get all users for debugging
        const allUsers = await locals.pb.collection('users').getList(1, 50);
        console.log('🔍 SHARE_RESOURCE: All users in database:', 
          allUsers.items.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name || u.username
          }))
        );
        
        // Try exact match
        const userResult = await locals.pb.collection('users').getList(1, 1, {
          filter: `email = "${sharedWithEmail}"`
        });
        
        if (userResult.items && userResult.items.length > 0) {
          sharedWithUser = userResult.items[0];
          console.log('✅ SHARE_RESOURCE: Found user:', {
            id: sharedWithUser.id,
            email: sharedWithUser.email,
            name: sharedWithUser.name
          });
        } else {
          // Enhanced error message with suggestions
          const availableEmails = allUsers.items.map(u => u.email).join(', ');
          return {
            type: 'error',
            error: `User with email "${sharedWithEmail}" not found. Available users: ${availableEmails}`
          };
        }
        
      } catch (userError) {
        console.log('❌ SHARE_RESOURCE: User lookup failed:', userError);
        return {
          type: 'error',
          error: `Failed to find user with email "${sharedWithEmail}". Make sure they have registered.`
        };
      }

      // Check for existing share
      try {
        const existingShareResult = await locals.pb.collection('shares').getList(1, 1, {
          filter: `resource_id = "${resourceId}" && resource_type = "${resourceType}" && shared_with = "${sharedWithUser.id}"`
        });
        
        if (existingShareResult.items && existingShareResult.items.length > 0) {
          const existingShare = existingShareResult.items[0];
          const updatedShare = await locals.pb.collection('shares').update(existingShare.id, {
            permission: permission,
            message: message,
            expires_at: expiresAt,
            is_active: true,
            updated: new Date().toISOString()
          });

          console.log('✅ SHARE_RESOURCE: Updated existing share:', updatedShare.id);
          return {
            type: 'success',
            message: `Share updated successfully with ${sharedWithEmail}`,
            share: updatedShare
          };
        }
      } catch (existingError) {
        console.log('🔍 SHARE_RESOURCE: No existing share found, creating new one');
      }

      // Create new share
      const shareData = {
        owner: locals.user.id,
        resource_id: resourceId,
        resource_type: resourceType,
        shared_with: sharedWithUser.id,
        permission: permission,
        is_active: true
      };

      if (message && message.trim()) {
        shareData.message = message.trim();
      }

      if (expiresAt) {
        shareData.expires_at = expiresAt;
      }

      const newShare = await locals.pb.collection('shares').create(shareData);

      console.log('✅ SHARE_RESOURCE: Share created successfully:', {
        id: newShare.id,
        resource_id: resourceId,
        shared_with_email: sharedWithEmail,
        permission: permission
      });

      // Add to recent activity
      try {
        await locals.pb.collection('recent_activity').create({
          user: locals.user.id,
          action: 'share',
          resource_type: resourceType,
          resource_id: resourceId,
          resource_name: `Shared with ${sharedWithEmail}`
        });
      } catch (activityError) {
        console.warn('⚠️ SHARE_RESOURCE: Failed to create activity log:', activityError);
      }

      return {
        type: 'success',
        message: `Successfully shared with ${sharedWithEmail}`,
        share: newShare
      };

    } catch (error) {
      console.error('❌ SHARE_RESOURCE: Error:', error);
      return {
        type: 'error',
        error: error.message || 'Failed to share item'
      };
    }
  },

  resendVerification: async ({ request, locals }) => {
    console.log('🔍 RESEND_VERIFICATION: Action called');
    
    try {
      const data = await request.formData();
      const email = data.get('email');
      
      if (!email) {
        console.log('🔍 RESEND_VERIFICATION: No email provided');
        return { type: 'error', error: 'Email is required' };
      }

      console.log('🔍 RESEND_VERIFICATION: Attempting to resend for:', email);

      // Method 1: Try using the locals.pb instance
      if (locals.pb && locals.pb.authStore.isValid) {
        try {
          await locals.pb.collection('users').requestVerification(email);
          console.log('🔍 RESEND_VERIFICATION: Success with locals.pb');
          return { type: 'success', message: 'Verification email sent successfully!' };
        } catch (error) {
          console.log('🔍 RESEND_VERIFICATION: locals.pb failed:', error.message);
        }
      }

      // Method 2: Create a fresh admin PocketBase instance
      const { PUBLIC_POCKETBASE_URL } = process.env;
      const adminPb = new PocketBase(PUBLIC_POCKETBASE_URL);
      
      // Try to authenticate as admin if you have admin credentials
      // (You might want to set these as environment variables)
      if (process.env.POCKETBASE_ADMIN_EMAIL && process.env.POCKETBASE_ADMIN_PASSWORD) {
        try {
          await adminPb.admins.authWithPassword(
            process.env.POCKETBASE_ADMIN_EMAIL,
            process.env.POCKETBASE_ADMIN_PASSWORD
          );
          console.log('🔍 RESEND_VERIFICATION: Admin auth successful');
        } catch (adminError) {
          console.log('🔍 RESEND_VERIFICATION: Admin auth failed:', adminError.message);
        }
      }

      // Try the verification request
      await adminPb.collection('users').requestVerification(email);
      console.log('🔍 RESEND_VERIFICATION: Success with admin instance');
      
      return { type: 'success', message: 'Verification email sent successfully!' };
      
    } catch (error) {
      console.error('🔍 RESEND_VERIFICATION: All methods failed:', error);
      
      // Return a more helpful error message
      let errorMessage = 'Failed to send verification email.';
      
      if (error.message?.includes('Failed to send email')) {
        errorMessage = 'Email service is temporarily unavailable. Please try again later.';
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'Too many requests. Please wait a few minutes before trying again.';
      } else if (error.message?.includes('not found')) {
        errorMessage = 'User not found. Please check your email address.';
      }
      
      return { type: 'error', error: errorMessage };
    }
  }
};

async function deleteAllFolderContents(pb, folderId, userId) {
  console.log('🔍 RECURSIVE_DELETE: Starting deletion for folder:', folderId);
  
  try {
    // Get all subfolders in this folder
    const subFolders = await pb.collection('folders').getList(1, 200, {
      filter: `parent_folder = "${folderId}" && owner = "${userId}" && is_deleted = false`
    });

    // Recursively delete each subfolder
    for (const subFolder of subFolders.items) {
      await deleteAllFolderContents(pb, subFolder.id, userId);
      await pb.collection('folders').update(subFolder.id, {
        is_deleted: true,
        deleted_at: new Date().toISOString()
      });
    }

    // Get all files in this folder
    const folderFiles = await pb.collection('files').getList(1, 200, {
      filter: `parent_folder = "${folderId}" && owner = "${userId}" && is_deleted = false`
    });

    // Delete all files
    for (const file of folderFiles.items) {
      await pb.collection('files').update(file.id, {
        is_deleted: true,
        deleted_at: new Date().toISOString()
      });
    }

    console.log(`✅ RECURSIVE_DELETE: Deleted ${subFolders.items.length} subfolders and ${folderFiles.items.length} files`);

  } catch (error) {
    console.error('❌ RECURSIVE_DELETE: Error deleting folder contents:', error);
    throw error;
  }
}