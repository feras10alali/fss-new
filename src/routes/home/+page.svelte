<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { PUBLIC_POCKETBASE_URL } from '$env/static/public';
  import PocketBase from 'pocketbase';
  import Evb from '$lib/components/EmailVerificationAlert.svelte';
  import logo from '$lib/images/OBlogo.webp'
  import Tlogo from '$lib/images/BTlogo.webp'
  export let data;

  let showProfileDropdown = false;
  const pb = new PocketBase(PUBLIC_POCKETBASE_URL);
  let files = [];
  let folders = [];
  let allItems = [];
  let recentItems = [];
  let favorites = data?.favorites || [];
  let storageUsed = data?.storageUsed || 0;
  let storageTotal = data?.storageTotal || 15;
  let viewMode = 'list';
  let searchQuery = '';
  let currentView = 'my-drive'; // my-drive, shared, recent, starred, trash
  let showNewModal = false;
  let uploading = false;
  let uploadProgress = 0;

  let dragOver = false;
  let dragCounter = 0;

  let showNewForm = false;
  let newItemType = ''; // 'file' or 'folder'
  let newItemName = '';
  let selectedPath = '/';
  let selectedParentFolderId = null; // Track the actual folder ID
  let availableFolders = [];

  let fileInput;
  let createFolderForm;
  let uploadForm;

  let currentItems = [];
  let currentTitle = 'My storge';
  let activeDropdown = null;

  let currentFolderId = null;
  let folderPath = [];
  let breadcrumbs = [{ id: null, name: 'My Storage' }];
  
  let currentShareItem = null;
  let showShareModal = false;
  let shareEmail = '';
  let sharePermission = 'view';
  let shareMessage = '';
  let shareExpiry = '';
  let isSharing = false;
  let shareError = '';
  let shareSuccess = '';

  let showRenameModal = false;
  let currentRenameItem = null;
  let isRenaming = false;
  let renameError = '';

  // State for delete confirmation
  let showDeleteModal = false;
  let currentDeleteItem = null;
  let isDeleting = false;
  let deleteError = '';

  let showPhotoModal = false;
  let currentPhoto = null;
  let photoLoading = true;
  let photoError = false;
  let imageScale = 1;
  let imageX = 0;
  let imageY = 0;
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };
  let lastImageX = 0;
  let lastImageY = 0;

  // 3. Add these photo preview functions
  function openPhoto(item) {
    if (item.type === 'image') {
      currentPhoto = item;
      showPhotoModal = true;
      photoLoading = true;
      photoError = false;
      imageScale = 1;
      imageX = 0;
      imageY = 0;
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }
  }

  function closePhotoModal() {
    showPhotoModal = false;
    currentPhoto = null;
    photoLoading = true;
    photoError = false;
    imageScale = 1;
    imageX = 0;
    imageY = 0;
    
    // Restore body scroll
    document.body.style.overflow = '';
  }

  function handlePhotoKeydown(event) {
    if (!showPhotoModal) return;
    
    switch (event.code) {
      case 'Escape':
        closePhotoModal();
        break;
      case 'Equal':
      case 'NumpadAdd':
        event.preventDefault();
        zoomIn();
        break;
      case 'Minus':
      case 'NumpadSubtract':
        event.preventDefault();
        zoomOut();
        break;
      case 'Digit0':
      case 'Numpad0':
        event.preventDefault();
        resetZoom();
        break;
    }
  }

  function zoomIn() {
    imageScale = Math.min(imageScale * 1.2, 5);
  }

  function zoomOut() {
    imageScale = Math.max(imageScale / 1.2, 0.1);
  }

  function resetZoom() {
    imageScale = 1;
    imageX = 0;
    imageY = 0;
  }

  function handleMouseDown(event) {
    if (imageScale > 1) {
      isDragging = true;
      dragStart = { x: event.clientX, y: event.clientY };
      lastImageX = imageX;
      lastImageY = imageY;
      event.preventDefault();
    }
  }

  function handleMouseMove(event) {
    if (isDragging && imageScale > 1) {
      const deltaX = event.clientX - dragStart.x;
      const deltaY = event.clientY - dragStart.y;
      imageX = lastImageX + deltaX;
      imageY = lastImageY + deltaY;
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleWheel(event) {
    event.preventDefault();
    if (event.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  }

  // Update the existing renameItem function
  function renameItem(item) {
    currentRenameItem = item;
    newItemName = item.name;
    renameError = '';
    showRenameModal = true;
  }

  // Add new function to handle rename submission
  async function handleRename() {
    if (!newItemName.trim()) {
      renameError = 'Name cannot be empty';
      return;
    }

    if (newItemName.trim() === currentRenameItem.name) {
      renameError = 'New name must be different from current name';
      return;
    }

    isRenaming = true;
    renameError = '';

    try {
      // Create a form element dynamically
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = '?/renameItem';
      
      // Add form data
      const fields = [
        ['item_id', currentRenameItem.id],
        ['item_type', currentRenameItem.type],
        ['new_name', newItemName.trim()],
        ['old_name', currentRenameItem.name]
      ];
      
      fields.forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);

      // Submit with enhance
      const submitForm = enhance(form, ({ result, update }) => {
        if (result.type === 'success') {
          console.log('✅ Rename successful:', result.data);
          closeRenameModal();
          alert(`Successfully renamed "${currentRenameItem.name}" to "${newItemName.trim()}"`);
          update();
        } else if (result.type === 'error') {
          console.error('❌ Rename failed:', result.error);
          renameError = result.error?.message || 'Failed to rename item';
        } else if (result.type === 'failure') {
          console.error('❌ Rename validation failed:', result.data);
          renameError = 'Validation failed';
        }
        
        isRenaming = false;
        document.body.removeChild(form);
      });

      form.requestSubmit();

    } catch (error) {
      console.error('❌ Rename error:', error);
      renameError = error.message || 'Network error. Please try again.';
      isRenaming = false;
    }
  }

  function closeRenameModal() {
    showRenameModal = false;
    currentRenameItem = null;
    newItemName = '';
    renameError = '';
    isRenaming = false;
  }

  // Update the existing deleteItem function
  function deleteItem(item) {
    currentDeleteItem = item;
    deleteError = '';
    showDeleteModal = true;
  }

  // Add new function to handle delete confirmation
  async function handleDelete() {
    if (!currentDeleteItem) return;

    isDeleting = true;
    deleteError = '';

    try {
      const formData = new FormData();
      formData.append('item_id', currentDeleteItem.id);
      formData.append('item_type', currentDeleteItem.type);
      formData.append('item_name', currentDeleteItem.name);

      console.log('Deleting item:', {
        id: currentDeleteItem.id,
        type: currentDeleteItem.type,
        name: currentDeleteItem.name
      });

      const response = await fetch('', {  // Empty string means current page
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (response.ok) {
        console.log('✅ Delete successful');
        closeDeleteModal();
        
        // Show success message
        alert(`Successfully moved "${currentDeleteItem.name}" to trash`);
        
        // Reload to show changes
        location.reload();
      } else {
        const errorText = await response.text();
        console.error('❌ Delete failed with status:', response.status);
        deleteError = `Server error: ${response.status}`;
      }

    } catch (error) {
      console.error('❌ Delete error:', error);
      deleteError = error.message || 'Network error. Please try again.';
    } finally {
      isDeleting = false;
    }
  }
  function closeDeleteModal() {
    showDeleteModal = false;
    currentDeleteItem = null;
    deleteError = '';
    isDeleting = false;
  }
  

  function navigateToFolder(folder) {
    console.log('🔍 NAVIGATE_FOLDER: Entering folder:', folder.name, folder.id);
    
    // Update current folder
    currentFolderId = folder.id;
    
    // Update breadcrumbs
    const existingIndex = breadcrumbs.findIndex(crumb => crumb.id === folder.id);
    if (existingIndex !== -1) {
      // If folder is already in breadcrumbs, truncate to that point
      breadcrumbs = breadcrumbs.slice(0, existingIndex + 1);
    } else {
      // Add new folder to breadcrumbs
      breadcrumbs = [...breadcrumbs, { id: folder.id, name: folder.name }];
    }
    
    // Make sure we're in my-drive view when navigating folders
    if (currentView !== 'my-drive') {
      currentView = 'my-drive';
    }
    
    console.log('🔍 NAVIGATE_FOLDER: Updated breadcrumbs:', breadcrumbs);
    console.log('🔍 NAVIGATE_FOLDER: Current folder ID:', currentFolderId);
  }
  

  function navigateToSharedFolder(folder) {
    console.log('🔍 NAVIGATE_SHARED_FOLDER: Entering shared folder:', folder.name, folder.id);
    
    // Update current folder
    currentFolderId = folder.id;
    
    // FIXED: Reset breadcrumbs properly for shared folders
    if (currentView !== 'shared') {
      // Coming from another view - start fresh breadcrumbs
      breadcrumbs = [
        { id: null, name: 'Shared with me' },
        { 
          id: folder.id, 
          name: folder.name,
          shared: true,
          shared_by: folder.shared_by
        }
      ];
    } else {
      // Already in shared view - add to existing breadcrumbs
      const existingIndex = breadcrumbs.findIndex(crumb => crumb.id === folder.id);
      if (existingIndex !== -1) {
        // If folder is already in breadcrumbs, truncate to that point
        breadcrumbs = breadcrumbs.slice(0, existingIndex + 1);
      } else {
        // Add new shared folder to breadcrumbs
        breadcrumbs = [...breadcrumbs, { 
          id: folder.id, 
          name: folder.name,
          shared: true,
          shared_by: folder.shared_by
        }];
      }
    }
    
    // Switch to shared view
    currentView = 'shared';
    
    console.log('🔍 NAVIGATE_SHARED_FOLDER: Updated breadcrumbs:', breadcrumbs);
    console.log('🔍 NAVIGATE_SHARED_FOLDER: Current folder ID:', currentFolderId);
  }

  // 3. ADD THIS NEW FUNCTION (add after navigateToFolder)
  function navigateToBreadcrumb(breadcrumb) {
    console.log('🔍 NAVIGATE_BREADCRUMB: Going to:', breadcrumb.name, breadcrumb.id);
    
    currentFolderId = breadcrumb.id;
    
    // Update breadcrumbs - remove everything after the clicked breadcrumb
    const index = breadcrumbs.findIndex(crumb => crumb.id === breadcrumb.id);
    if (index !== -1) {
      breadcrumbs = breadcrumbs.slice(0, index + 1);
    }
    
    // FIXED: Ensure we're in the correct view based on breadcrumb type
    if (breadcrumb.shared || breadcrumb.name === 'Shared with me') {
      currentView = 'shared';
    } else if (breadcrumb.name === 'My Storage' || (!breadcrumb.shared && currentView === 'shared')) {
      currentView = 'my-drive';
    }
    
    console.log('🔍 NAVIGATE_BREADCRUMB: Updated breadcrumbs:', breadcrumbs);
    console.log('🔍 NAVIGATE_BREADCRUMB: Current view:', currentView);
  }


  function toggleDropdown(itemId, event) {
    event.stopPropagation();
    activeDropdown = activeDropdown === itemId ? null : itemId;
  }

  function closeDropdowns() {
    activeDropdown = null;
  }

  function handleDropdownAction(action, item, event) {
      event.stopPropagation();
      activeDropdown = null;
      
      switch(action) {
        case 'download':
          downloadFile(item);
          break;
        case 'rename':
          if (item.shared_with_me) {
            alert('You cannot rename shared items');
          } else {
            renameItem(item);
          }
          break;
        case 'share':
          if (item.shared_with_me) {
            alert('You cannot share items that are shared with you');
          } else {
            shareItem(item);
          }
          break;
        case 'delete':
          if (item.shared_with_me) {
            alert('You cannot delete shared items');
          } else {
            deleteItem(item);
          }
          break;
      }
    }

  function downloadFile(item) {
    const url = `/api/download?id=${item.id}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function shareItem(item) {
    currentShareItem = item;  // Changed from shareItem to currentShareItem
    shareEmail = '';
    sharePermission = 'view';
    shareMessage = '';
    shareExpiry = '';
    shareError = '';
    shareSuccess = '';
    showShareModal = true;
  }

   function closeShareModal() {
    showShareModal = false;
    currentShareItem = null;  // Changed from shareItem to currentShareItem
    shareEmail = '';
    sharePermission = 'view';
    shareMessage = '';
    shareExpiry = '';
    shareError = '';
    shareSuccess = '';
    isSharing = false;
  }

  // Update your handleShare function in the Svelte component

  async function handleShare() {
    if (!shareEmail.trim()) {
      shareError = 'Please enter an email address';
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(shareEmail.trim())) {
      shareError = 'Please enter a valid email address';
      return;
    }

    isSharing = true;
    shareError = '';
    shareSuccess = '';

    try {
      const formData = new FormData();
      formData.append('resource_id', currentShareItem.id);
      
      // FIX: Determine the correct resource type
      const resourceType = currentShareItem.type === 'folder' ? 'folder' : 'file';
      formData.append('resource_type', resourceType);
      
      formData.append('shared_with_email', shareEmail.trim());
      formData.append('permission', sharePermission);
      if (shareMessage.trim()) {
        formData.append('message', shareMessage.trim());
      }
      if (shareExpiry) {
        formData.append('expires_at', new Date(shareExpiry).toISOString());
      }

      console.log('Sending share request with data:', {
        resource_id: currentShareItem.id,
        resource_type: resourceType, // Updated to show the corrected value
        shared_with_email: shareEmail.trim(),
        permission: sharePermission
      });

      const response = await fetch('?/shareResource', {
        method: 'POST',
        body: formData
      });

      console.log('Share response status:', response.status);

      const result = await response.json();
      console.log('Share result:', result);
      
      if (result.type === 'success') {
        shareSuccess = result.message || `Successfully shared "${currentShareItem.name}" with ${shareEmail}`;
        // Clear form after delay
        setTimeout(() => {
          closeShareModal();
        }, 2000);
      } else {
        shareError = result.error || 'Failed to share item';
      }

    } catch (error) {
      console.error('Share error:', error);
      shareError = error.message || 'Network error. Please try again.';
    } finally {
      isSharing = false;
    }
  }


  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragEnter(event) {
    event.preventDefault();
    dragCounter++;
    if (dragCounter === 1) {
      dragOver = true;
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();
    dragCounter--;
    if (dragCounter === 0) {
      dragOver = false;
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    dragOver = false;
    dragCounter = 0;
    
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      console.log('📁 Dropped files:', files.map(f => f.name));
      
      // Create a synthetic event for handleFileUpload
      const syntheticEvent = {
        target: {
          files: files,
          value: ''
        }
      };
      
      handleFileUpload(syntheticEvent);
    }
  }


  async function handleLogout() {
    try {
      // Call the server logout endpoint
      const response = await fetch('/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // Clear client-side auth store
        pb.authStore.clear();
        // Redirect to login page
        goto('/login');
      } else {
        throw new Error('Logout request failed');
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Clear client auth anyway and force redirect
      pb.authStore.clear();
      goto('/login');
    }
  }

  function handleClickOutside(event) {
    if (!event.target.closest('.profile-dropdown-container')) {
      showProfileDropdown = false;
    }
    // Close item dropdowns when clicking outside
    if (!event.target.closest('.relative')) {
      closeDropdowns();
    }
  }

  // Initialize data
  $: {
    const safeFiles = data?.files || [];
    const safeFolders = data?.folders || [];
    const safeSharedFiles = data?.sharedFiles || [];
    const safeSharedFolders = data?.sharedFolders || [];
    
    console.log('🔍 DATA_INIT: Raw data counts:', {
      ownFiles: safeFiles.length,
      ownFolders: safeFolders.length,
      sharedFiles: safeSharedFiles.length,
      sharedFolders: safeSharedFolders.length
    });
    
    console.log('🔍 DATA_INIT: Shared files details:', safeSharedFiles.map(f => ({
      name: f.name,
      parent: f.parent_folder,
      shared_by: f.shared_by?.email
    })));
    
    console.log('🔍 DATA_INIT: Shared folders details:', safeSharedFolders.map(f => ({
      name: f.name,
      parent: f.parent_folder,
      shared_by: f.shared_by?.email
    })));
    
    // Combine own items with shared items
    allItems = [
      // Own folders
      ...safeFolders.map(folder => ({
        ...folder,
        type: 'folder',
        size: 'folder',
        modified: formatDate(folder.updated),
        starred: favorites.includes(folder.id),
        shared_with_me: false
      })),
      // Own files
      ...safeFiles.map(file => ({
        ...file,
        type: getFileType(file.mime_type),
        size: formatFileSize(file.size),
        modified: formatDate(file.updated),
        starred: favorites.includes(file.id),
        shared_with_me: false
      })),
      // Shared folders
      ...safeSharedFolders.map(folder => ({
        ...folder,
        type: 'folder',
        size: 'folder',
        modified: formatDate(folder.updated),
        starred: favorites.includes(folder.id),
        shared_with_me: true,
        share_permission: folder.share_permission,
        shared_by: folder.shared_by,
        share_message: folder.share_message
      })),
      // Shared files
      ...safeSharedFiles.map(file => ({
        ...file,
        type: getFileType(file.mime_type),
        size: formatFileSize(file.size),
        modified: formatDate(file.updated),
        starred: favorites.includes(file.id),
        shared_with_me: true,
        share_permission: file.share_permission,
        shared_by: file.shared_by,
        share_message: file.share_message
      }))
    ];

    console.log('🔍 DATA_INIT: Final allItems count:', allItems.length);
    console.log('🔍 DATA_INIT: Shared items in allItems:', allItems.filter(i => i.shared_with_me).map(i => ({
      name: i.name,
      type: i.type,
      parent: i.parent_folder,
      shared: i.shared_with_me
    })));

    // Update available folders for the form (only own folders)
    updateAvailableFolders();
  }

  // Update current view data
  $: {
    let baseItems = allItems;
    
    console.log('🔍 FILTER: Starting filter with', allItems.length, 'total items');
    console.log('🔍 FILTER: Current view:', currentView, 'Current folder:', currentFolderId);
    
    // Filter by current folder if we're in a specific folder
    if (currentFolderId) {
      if (currentView === 'my-drive') {
        // In my-drive view, show only own items in this folder
        baseItems = allItems.filter(item => 
          item.parent_folder === currentFolderId && !item.shared_with_me
        );
        console.log('🔍 FILTER: My-drive folder filter result:', baseItems.length, 'items');
      } else if (currentView === 'shared') {
        // In shared view, show shared items in this folder
        baseItems = allItems.filter(item => {
          const hasCorrectParent = item.parent_folder === currentFolderId;
          const isSharedItem = item.shared_with_me === true;
          const result = hasCorrectParent && isSharedItem;
          
          if (hasCorrectParent || isSharedItem) {
            console.log(`🔍 FILTER: Item "${item.name}" - parent: ${item.parent_folder}, shared: ${item.shared_with_me}, result: ${result}`);
          }
          
          return result;
        });
        console.log('🔍 FILTER: Shared folder filter result:', baseItems.length, 'items');
      }
    } else {
      // Root level filtering
      if (currentView === 'my-drive') {
        // Show root level own items only
        baseItems = allItems.filter(item => 
          !item.parent_folder && !item.shared_with_me
        );
        console.log('🔍 FILTER: My-drive root filter result:', baseItems.length, 'items');
      } else if (currentView === 'shared') {
        // FIXED: Show all direct shared items at root level
        // This includes items shared directly AND items in shared folders that should be visible at root
        baseItems = allItems.filter(item => {
          const isSharedItem = item.shared_with_me === true;
          
          // Show if:
          // 1. Item is shared and has no parent (direct share)
          // 2. Item is shared and parent folder doesn't exist in our shared folders (orphaned file)
          // 3. Item is a shared folder at root level
          
          if (!isSharedItem) return false;
          
          // If no parent folder, always show
          if (!item.parent_folder) {
            return true;
          }
          
          // If has parent folder, check if the parent folder is also shared
          const parentFolderShared = allItems.find(folder => 
            folder.id === item.parent_folder && 
            folder.shared_with_me === true && 
            folder.type === 'folder'
          );
          
          // If parent folder is not shared, show the item at root level (orphaned)
          if (!parentFolderShared) {
            console.log(`🔍 FILTER: Showing orphaned shared item "${item.name}" at root`);
            return true;
          }
          
          // If parent folder is shared, don't show at root (will be shown when navigating into folder)
          return false;
        });
        
        console.log('🔍 FILTER: Shared root filter result:', baseItems.length, 'items');
        console.log('🔍 FILTER: Shared root items:', baseItems.map(i => ({
          name: i.name,
          type: i.type,
          parent: i.parent_folder,
          shared: i.shared_with_me
        })));
      }
    }
    
    // Apply view-specific filtering (rest remains the same)
    switch (currentView) {
      case 'my-drive':
        currentItems = baseItems;
        currentTitle = breadcrumbs[breadcrumbs.length - 1]?.name || 'My Storage';
        break;
      case 'shared':
        currentItems = baseItems;
        if (currentFolderId) {
          const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
          currentTitle = currentBreadcrumb?.shared ? 
            `${currentBreadcrumb.name} (shared by ${currentBreadcrumb.shared_by?.name || currentBreadcrumb.shared_by?.email})` :
            currentBreadcrumb?.name || 'Shared folder';
        } else {
          currentTitle = 'Shared with me';
        }
        break;
      case 'recent':
        currentItems = allItems.slice(0, 10);
        currentTitle = 'Recent';
        break;
      case 'starred':
        currentItems = allItems.filter(item => item.starred);
        currentTitle = 'Starred';
        break;
      case 'trash':
        currentItems = allItems.filter(item => item.is_deleted && !item.shared_with_me);
        currentTitle = 'Trash';
        break;
      default:
        currentItems = baseItems;
        currentTitle = 'My Storage';
    }
    
    console.log('🔍 FILTER: Final currentItems:', currentItems.length, 'items');
    console.log('🔍 FILTER: Final items details:', currentItems.map(i => ({
      name: i.name,
      type: i.type,
      parent: i.parent_folder,
      shared: i.shared_with_me
    })));
  }

  // Get recent items (last 4)
  $: recentItems = allItems.slice(0, 4);

  // Filter items based on search
  $: filteredItems = currentItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

 function switchView(view) {
  console.log('🔍 SWITCH_VIEW: Changing to:', view);
  currentView = view;
  
  // FIXED: Reset navigation properly when switching views
  if (view === 'shared') {
    // When switching to shared view, reset to shared root
    currentFolderId = null;
    breadcrumbs = [{ id: null, name: 'Shared with me' }];
  } else if (view === 'my-drive') {
    // When switching to my-drive, reset to my storage root
    currentFolderId = null;
    breadcrumbs = [{ id: null, name: 'My Storage' }];
  } else {
    // For other views (recent, starred, trash), reset to view root
    currentFolderId = null;
    breadcrumbs = [{ id: null, name: getViewTitle(view) }];
  }
  
  // Close any open dropdowns
  activeDropdown = null;
}


  function updateAvailableFolders() {
    const folders = allItems.filter(item => item.type === 'folder');
    
    if (selectedParentFolderId === null) {
      // Show root level folders
      availableFolders = folders.filter(folder => !folder.parent_folder);
    } else {
      // Show subfolders of the selected parent
      availableFolders = folders.filter(folder => folder.parent_folder === selectedParentFolderId);
    }
  }

  function getFolderIdFromPath(pathParts) {
    let currentFolderId = null;
    const folders = allItems.filter(item => item.type === 'folder');
    
    console.log('Getting folder ID from path parts:', pathParts);
    console.log('Available folders:', folders.map(f => ({ id: f.id, name: f.name, parent: f.parent_folder })));
    
    for (const part of pathParts) {
      const folder = folders.find(f => {
        const nameMatch = f.name === part;
        const parentMatch = f.parent_folder === currentFolderId;
        console.log(`Checking folder "${f.name}" (${f.id}): nameMatch=${nameMatch}, parentMatch=${parentMatch}, parent=${f.parent_folder}, currentParent=${currentFolderId}`);
        return nameMatch && parentMatch;
      });
      
      if (folder) {
        currentFolderId = folder.id;
        console.log(`Found folder "${part}" with ID:`, currentFolderId);
      } else {
        console.log(`Folder "${part}" not found in current path`);
        break;
      }
    }
    
    console.log('Final folder ID:', currentFolderId);
    return currentFolderId;
  }

  function getFileType(mimeType) {
    if (!mimeType) return 'file';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf')) return 'pdf';
    if (mimeType.includes('document') || mimeType.includes('msword')) return 'doc';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'presentation';
    
    return 'file';
  }

  function getFileIcon(type) {
    const icons = {
      folder: '📁',
      pdf: '📝',
      doc: '📝',
      spreadsheet: '📊',
      presentation: '📎',
      video: '🎥',
      image: '🖼️',
      audio: '🎵',
      file: '📄'
    };
    return icons[type] || '📄';
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
    return `${Math.ceil(diffDays / 365)} years ago`;
  }

  async function toggleStar(itemId, resourceType) {
    try {
      // Load auth from cookie if not already loaded
      pb.authStore.loadFromCookie(document.cookie);
      const userId = pb.authStore.model.id;
      const isStarred = favorites.includes(itemId);
      
      console.log('Toggling star for item:', itemId, 'User:', userId, 'Currently starred:', isStarred);
      
      if (isStarred) {
        // Remove from favorites
        try {
          const favorite = await pb.collection('favorites').getFirstListItem(
            `user = "${userId}" && resource_id = "${itemId}" && resource_type = "${resourceType}"`
          );
          await pb.collection('favorites').delete(favorite.id);
          favorites = favorites.filter(id => id !== itemId);
          console.log('Removed from favorites');
        } catch (findError) {
          console.error('Error finding/removing favorite:', findError);
          // If we can't find the favorite record, just remove it from the local array
          favorites = favorites.filter(id => id !== itemId);
        }
      } else {
        // Add to favorites
        await pb.collection('favorites').create({
          user: userId,
          resource_id: itemId,
          resource_type: resourceType
        });
        favorites = [...favorites, itemId];
        console.log('Added to favorites');
      }
      
      // Update the item's starred status in the UI
      allItems = allItems.map(item => 
        item.id === itemId ? { ...item, starred: !item.starred } : item
      );
    } catch (error) {
      console.error('Error toggling star:', error);
      if (error.status === 401 || error.status === 403) {
        alert('Authentication required. Please refresh the page and try again.');
      } else {
        alert('Failed to update favorite. Please try again.');
      }
    }
  }

  function handleItemClick(item) {
    if (item.type === 'folder') {
      console.log('🔍 ITEM_CLICK: Folder clicked:', item.name, 'Shared:', item.shared_with_me);
      
      if (!item.shared_with_me) {
        navigateToFolder(item);
      } else {
        navigateToSharedFolder(item);
      }
    } else if (item.type === 'image') {
      // Open photo preview modal
      openPhoto(item);
    } else if (item.type === 'video') {
      // Navigate to video player page
      goto(`/video/${item.id}`);
    } else {
      // Other file types - existing logic
      console.log('🔍 ITEM_CLICK: Opening file:', item.name);
      
      if (!pb.authStore.isValid) {
        pb.authStore.loadFromCookie(document.cookie);
      }
      
      if (item.shared_with_me) {
        const fileUrl = pb.getFileUrl(item, item.file);
        window.open(fileUrl, '_blank');
      } else {
        const fileUrl = pb.getFileUrl(item, item.file);
        window.open(fileUrl, '_blank');
      }
    }
  }

  function openNewModal() {
    showNewModal = true;
  }

  function closeNewModal() {
    showNewModal = false;
  }

  function openNewForm(type) {
    newItemType = type;
    newItemName = '';
    selectedPath = '/';
    selectedParentFolderId = null; // Reset to root
    showNewForm = true;
    showNewModal = false;
    updateAvailableFolders();
  }

  function closeNewForm() {
    showNewForm = false;
    newItemType = '';
    newItemName = '';
    selectedPath = '/';
    selectedParentFolderId = null;
  }

  function handlePathClick(event, index) {
    if (index === -1) {
      // Clicked on root "/"
      selectedPath = '/';
      selectedParentFolderId = null;
    } else {
      // Clicked on a specific folder in the path
      const pathParts = selectedPath === '/' ? [] : selectedPath.split('/').filter(Boolean);
      const newPathParts = pathParts.slice(0, index + 1);
      selectedPath = newPathParts.length > 0 ? '/' + newPathParts.join('/') + '/' : '/';
      
      // Update the selected parent folder ID
      selectedParentFolderId = newPathParts.length > 0 ? getFolderIdFromPath(newPathParts) : null;
    }
    
    updateAvailableFolders();
  }

  // Enhanced folder selection function for the dropdown
  function selectFolder(folderId, folderName) {
    console.log('Selecting folder:', folderId, folderName);
    
    // Update the selected parent folder ID
    selectedParentFolderId = folderId;
    
    // Update the path display
    const currentPathParts = selectedPath === '/' ? [] : selectedPath.split('/').filter(Boolean);
    const newPath = currentPathParts.length > 0 ? 
      selectedPath + folderName + '/' : 
      '/' + folderName + '/';
    selectedPath = newPath;
    
    console.log('Updated selectedPath:', selectedPath);
    console.log('Updated selectedParentFolderId:', selectedParentFolderId);
    
    // Update available folders for the new location
    updateAvailableFolders();
  }

  async function submitNewItem() {
    // Only check for name if creating a folder
    if (newItemType === 'folder' && !newItemName.trim()) {
      alert('Please enter a folder name');
      return;
    }

    try {
      console.log('Creating item with parent folder:', selectedParentFolderId, 'from path:', selectedPath);

      if (newItemType === 'folder') {
        const formData = new FormData();
        formData.append('name', newItemName.trim());
        
        // Use current folder as parent if no specific parent is selected
        const parentId = selectedParentFolderId || currentFolderId;
        if (parentId) {
          formData.append('parent_folder', parentId);
          console.log('Adding parent_folder to form data:', parentId);
        } else {
          console.log('No parent folder selected - creating in root');
        }

        console.log('Form data entries:', Array.from(formData.entries()));

        const response = await fetch('?/createFolder', {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (result.type === 'success') {
          console.log('Folder created successfully');
          closeNewForm();
          location.reload();
        } else {
          alert('Failed to create folder: ' + (result.error || 'Unknown error'));
        }
      } else if (newItemType === 'file') {
        // Store the parent folder ID for file upload (use current folder if none selected)
        window.selectedParentFolder = selectedParentFolderId || currentFolderId;
        closeNewForm();
        // Trigger file upload
        fileInput.click();
      }
      
    } catch (error) {
      console.error('Error creating item:', error);
      alert('Failed to create item: ' + (error.message || 'Network error'));
    }
  }

  function triggerFileUpload() {
    fileInput.click();
    closeNewModal();
  }

  // Enhanced file upload handler that uses server actions
// REPLACE the handleFileUpload function in your Svelte component with this:

  async function handleFileUpload(event) {
    const selectedFiles = Array.from(event.target.files);
    if (selectedFiles.length === 0) return;

    uploading = true;
    uploadProgress = 0;

    try {
      const totalFiles = selectedFiles.length;
      let completedFiles = 0;
      let successfulUploads = 0;
      const failedUploads = [];

      // Determine parent folder
      const parentFolderId = getTargetFolderId();
      console.log('File upload - Using parent folder:', parentFolderId);

      // Process files ONE BY ONE for heavy files (prevents timeout)
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        try {
          console.log(`Uploading file ${i + 1}/${totalFiles}: ${file.name} (${formatFileSize(file.size)})`);
          
          const formData = new FormData();
          formData.append('file', file);
          
          if (parentFolderId) {
            formData.append('parent_folder', parentFolderId);
          }

          // Extended timeout for heavy files
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

          const response = await fetch('?/uploadFile', {
            method: 'POST',
            body: formData,
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const result = await response.json();
          
          if (result.type === 'success') {
            console.log(`✅ File "${file.name}" uploaded successfully`);
            successfulUploads++;
          } else {
            console.error(`❌ Server action failed for file "${file.name}":`, result);
            failedUploads.push({ 
              name: file.name, 
              error: result.error || result.message || 'Server error',
              size: formatFileSize(file.size)
            });
          }
        } catch (fileError) {
          console.error(`❌ Failed to upload file "${file.name}":`, fileError);
          
          let errorMessage = 'Network error';
          if (fileError.name === 'AbortError') {
            errorMessage = 'Upload timeout (file too large or slow connection)';
          } else if (fileError.message) {
            errorMessage = fileError.message;
          }
          
          failedUploads.push({ 
            name: file.name, 
            error: errorMessage,
            size: formatFileSize(file.size)
          });
        }

        // Update progress
        completedFiles++;
        uploadProgress = (completedFiles / totalFiles) * 100;
        
        // Small delay between uploads to prevent overwhelming the server
        if (i < selectedFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Handle results with detailed feedback
      if (successfulUploads > 0) {
        console.log(`✅ Successfully uploaded ${successfulUploads} out of ${totalFiles} files`);
        
        if (failedUploads.length > 0) {
          const failedDetails = failedUploads.slice(0, 3).map(f => 
            `• ${f.name} (${f.size}): ${f.error}`
          ).join('\n');
          const moreText = failedUploads.length > 3 ? `\n... and ${failedUploads.length - 3} more failures` : '';
          
        } else {

        }
        
        // Refresh after short delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        location.reload();
      } else {
        // All uploads failed
        if (failedUploads.length > 0) {
          const errorSummary = failedUploads.slice(0, 5).map(f => 
            `• ${f.name} (${f.size}): ${f.error}`
          ).join('\n');
          const moreText = failedUploads.length > 5 ? `\n... and ${failedUploads.length - 5} more failures` : '';
          
          alert(`❌ No files were uploaded successfully:\n\n${errorSummary}${moreText}\n\n💡 Tips:\n• Try smaller files\n• Check your internet connection\n• Upload one file at a time for large files`);
        } else {
          alert('❌ Upload failed. Please try again.');
        }
      }

    } catch (error) {
      console.error('❌ Upload process failed:', error);
      alert('❌ Upload failed: ' + (error.message || 'Unknown error'));
    } finally {
      uploading = false;
      uploadProgress = 0;
      event.target.value = '';
      closeNewForm();
      clearSelectedFolder();
    }
  }

  // Helper function to determine target folder ID
  function getTargetFolderId() {
    // Priority 1: Explicitly selected folder from the form
    if (window.selectedParentFolder) {
      return window.selectedParentFolder;
    }
    
    // Priority 2: Currently selected parent folder ID
    if (selectedParentFolderId) {
      return selectedParentFolderId;
    }
    
    // Priority 3: Current folder from URL parameters
    const currentFolder = $page.url.searchParams.get('folder');
    return currentFolder || null;
  }

  // Helper function to clear folder selection
  function clearSelectedFolder() {
    window.selectedParentFolder = null;
    // Reset form state if needed
    if (showNewForm) {
      // You might want to reset selectedPath here depending on your UX preference
      // selectedPath = '/';
      // selectedParentFolderId = null;
    }
  }

  onMount(() => {
    pb.authStore.loadFromCookie(document.cookie);
    
    // Existing click handler
    const clickListener = (e) => {
      if (!e.target.closest('.relative') && !e.target.closest('.profile-dropdown-container')) {
        closeDropdowns();
        showProfileDropdown = false;
      }
    };
    
    // Drag and drop listeners
    const dragEnterListener = (e) => handleDragEnter(e);
    const dragLeaveListener = (e) => handleDragLeave(e);
    const dragOverListener = (e) => handleDragOver(e);
    const dropListener = (e) => handleDrop(e);
    
    document.addEventListener('click', clickListener);
    document.addEventListener('dragenter', dragEnterListener);
    document.addEventListener('dragleave', dragLeaveListener);
    document.addEventListener('dragover', dragOverListener);
    document.addEventListener('drop', dropListener);
    
    return () => {
      document.removeEventListener('click', clickListener);
      document.removeEventListener('dragenter', dragEnterListener);
      document.removeEventListener('dragleave', dragLeaveListener);
      document.removeEventListener('dragover', dragOverListener);
      document.removeEventListener('drop', dropListener);
    };
  });
</script>

<svelte:head>
  <title>HOME - FSS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50">
  <!-- Email Verification Alert -->
  <!-- Header -->
  <header class="flex items-center px-4 py-2 bg-white border-b border-gray-200 sticky top-0 z-50">
    <div class="flex items-center mr-auto">
      <img src={logo} alt="logo" class="w-18 ml-1">
      <img src={Tlogo} alt="text logo" class="w-26 ml-1.5">
    </div>
    
    <div class="relative max-w-2xl w-full mx-8">
      <input 
        type="text" 
        placeholder="Search files and folders"
        class="w-full py-3 pl-4 pr-12 border border-gray-200 rounded-lg bg-gray-100 text-base outline-none focus:bg-white focus:shadow-lg transition-all"
        bind:value={searchQuery}
      />
      <span class="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600">🔍</span>
    </div>

    <div class="flex items-center gap-2">
      <button 
        class="p-2 border-none bg-transparent rounded cursor-pointer text-lg text-gray-600 hover:bg-gray-100 {viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : ''}"
        title="Grid view" 
        on:click={() => viewMode = 'grid'}
      >
        ⊞
      </button>
      <button 
        class="p-2 border-none bg-transparent rounded cursor-pointer text-lg text-gray-600 hover:bg-gray-100 {viewMode === 'list' ? 'bg-blue-50 text-blue-600' : ''}"
        title="List view" 
        on:click={() => viewMode = 'list'}
      >
        ☰
      </button>
      <div class="relative profile-dropdown-container">
        <button 
          class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center ml-2 font-medium uppercase hover:bg-blue-700 transition-colors"
          on:click={() => showProfileDropdown = !showProfileDropdown}
        >
          {data?.user?.name?.charAt(0) || data?.user?.email?.charAt(0) || '👤'}
        </button>
        
        {#if showProfileDropdown}
          <div class="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <!-- User Info Section -->
            <div class="p-4 border-b border-gray-100">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium uppercase">
                  {data?.user?.name?.charAt(0) || data?.user?.email?.charAt(0) || '👤'}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium text-gray-900 truncate">
                    {data?.user?.name || 'User'}
                  </div>
                  <div class="text-sm text-gray-500 truncate">
                    {data?.user?.email}
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Menu Items -->
            <div class="py-2">
              <button 
                class="w-full flex items-center gap-3 px-4 py-2 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                on:click={() => {
                  showProfileDropdown = false;
                  goto('/profile'); // adjust this route as needed
                }}
              >
                <span class="text-lg">👤</span>
                <span>Profile</span>
              </button>
              
              <button 
                class="w-full flex items-center gap-3 px-4 py-2 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                on:click={() => {
                  showProfileDropdown = false;
                  goto('/settings'); // adjust this route as needed
                }}
              >
                <span class="text-lg">⚙️</span>
                <span>Settings</span>
              </button>
              
              <button 
                class="w-full flex items-center gap-3 px-4 py-2 text-left text-gray-700 hover:bg-gray-50 transition-colors"
                on:click={() => {
                  showProfileDropdown = false;
                  // Add help/support functionality
                }}
              >
                <span class="text-lg">❓</span>
                <span>Help & Support</span>
              </button>
              
              <hr class="my-2 border-gray-100">
              
              <button 
                class="w-full flex items-center gap-3 px-4 py-2 text-left text-red-600 hover:bg-red-50 transition-colors"
                on:click={handleLogout}
              >
                <span class="text-lg">🚪</span>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </header>
    <!-- Rename Modal - Add this to your HTML section -->
  {#if showRenameModal && currentRenameItem}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" on:click={closeRenameModal}>
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" on:click|stopPropagation>
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span class="text-xl">{getFileIcon(currentRenameItem.type)}</span>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">Rename {currentRenameItem.type}</h3>
              <p class="text-sm text-gray-500">Change the name of "{currentRenameItem.name}"</p>
            </div>
          </div>
          <button 
            class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            on:click={closeRenameModal}
          >
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Error Message -->
        {#if renameError}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>
              <span class="text-sm text-red-700">{renameError}</span>
            </div>
          </div>
        {/if}

        <!-- Form -->
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              New name
            </label>
            <input
              type="text"
              bind:value={newItemName}
              placeholder="Enter new name"
              class="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              class:border-red-300={renameError}
              disabled={isRenaming}
              on:keydown={(e) => {
                if (e.key === 'Enter') {
                  handleRename();
                } else if (e.key === 'Escape') {
                  closeRenameModal();
                }
              }}
            />
            <p class="text-xs text-gray-500 mt-1">
              Press Enter to rename or Escape to cancel
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-4">
            <button
              type="button"
              class="flex-1 px-4 py-3 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              on:click={closeRenameModal}
              disabled={isRenaming}
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              on:click={handleRename}
              disabled={isRenaming || !newItemName.trim()}
            >
              {#if isRenaming}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Renaming...
              {:else}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
                Rename
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Delete Confirmation Modal - Add this to your HTML section -->
  {#if showDeleteModal && currentDeleteItem}
    <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" on:click={closeDeleteModal}>
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" on:click|stopPropagation>
        <!-- Header -->
        <div class="flex items-center gap-4 mb-6">
          <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Delete {currentDeleteItem.type}?</h3>
            <p class="text-sm text-gray-500">This action will move the item to trash</p>
          </div>
        </div>

        <!-- Warning Content -->
        <div class="mb-6">
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div class="flex items-start gap-3">
              <div class="text-2xl">{getFileIcon(currentDeleteItem.type)}</div>
              <div class="flex-1">
                <div class="font-medium text-gray-900 mb-1">"{currentDeleteItem.name}"</div>
                <div class="text-sm text-gray-600">
                  {#if currentDeleteItem.type === 'folder'}
                    This folder and all its contents will be moved to trash.
                  {:else}
                    This file will be moved to trash.
                  {/if}
                </div>
              </div>
            </div>
          </div>
          
          <p class="text-sm text-gray-500 mt-4">
            You can restore deleted items from the Trash later.
          </p>
        </div>

        <!-- Error Message -->
        {#if deleteError}
          <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>
              <span class="text-sm text-red-700">{deleteError}</span>
            </div>
          </div>
        {/if}

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button
            type="button"
            class="flex-1 px-4 py-3 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            on:click={closeDeleteModal}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            class="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            on:click={handleDelete}
            disabled={isDeleting}
          >
            {#if isDeleting}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deleting...
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
              Move to Trash
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}
  {#if currentView === 'shared'}
    <div class="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 rounded-lg p-4 max-w-md max-h-64 overflow-y-auto text-xs z-50">
      <h4 class="font-bold mb-2">Debug: Shared View</h4>
      <div class="space-y-1">
        <div><strong>Current View:</strong> {currentView}</div>
        <div><strong>Current Folder ID:</strong> {currentFolderId || 'null (root)'}</div>
        <div><strong>Breadcrumbs:</strong> {JSON.stringify(breadcrumbs)}</div>
        <div><strong>All Items Count:</strong> {allItems.length}</div>
        <div><strong>Shared Items Count:</strong> {allItems.filter(i => i.shared_with_me).length}</div>
        <div><strong>Current Items Count:</strong> {currentItems.length}</div>
        
        <div class="mt-2">
          <strong>Shared Items Details:</strong>
          {#each allItems.filter(i => i.shared_with_me) as item}
            <div class="ml-2 text-xs">
              • {item.name} ({item.type}) - Parent: {item.parent_folder || 'none'} - By: {item.shared_by?.email || 'unknown'}
            </div>
          {/each}
        </div>
        
        <div class="mt-2">
          <strong>Current View Items:</strong>
          {#each currentItems as item}
            <div class="ml-2 text-xs">
              • {item.name} ({item.type}) - Parent: {item.parent_folder || 'none'} - Shared: {item.shared_with_me}
            </div>
          {/each}
        </div>
      </div>
      
      <button 
        class="mt-2 px-2 py-1 bg-yellow-500 text-white rounded text-xs"
        on:click={() => {
          console.log('🔍 MANUAL_DEBUG: All items:', allItems);
          console.log('🔍 MANUAL_DEBUG: Shared items:', allItems.filter(i => i.shared_with_me));
          console.log('🔍 MANUAL_DEBUG: Current items:', currentItems);
          console.log('🔍 MANUAL_DEBUG: Raw data:', data);
        }}
      >
        Log Details
      </button>
    </div>
  {/if}

  <div class="flex min-h-[calc(100vh-65px)]">
    <!-- Sidebar - Fixed positioning -->
    <aside class="w-64 bg-white border-r border-gray-200 p-4 flex flex-col fixed left-0 top-16 h-[calc(100vh-65px)] overflow-y-auto">
      <button 
        class="flex items-center gap-3 py-3 px-4 mt-4 border border-gray-200 rounded-3xl bg-white text-sm font-medium cursor-pointer mb-6 shadow-sm hover:shadow-md transition-shadow"
        on:click={openNewModal}
      >
        <span class="text-lg text-blue-600">+</span>
        New
      </button>

      <nav class="flex flex-col gap-1 mb-8">
        <button 
          class="flex items-center gap-3 py-2 px-3 rounded-lg text-gray-600 text-sm no-underline hover:bg-gray-100 {currentView === 'my-drive' ? 'bg-blue-50 text-blue-600 font-medium' : ''}"
          on:click={() => switchView('my-drive')}
        >
          <span class="text-base">🏠</span>
          My Storge
        </button>
        <button 
          class="flex items-center gap-3 py-2 px-3 rounded-lg text-gray-600 text-sm no-underline hover:bg-gray-100 {currentView === 'shared' ? 'bg-blue-50 text-blue-600 font-medium' : ''}"
          on:click={() => switchView('shared')}
        >
          <span class="text-base">👥</span>
          Shared with me
        </button>
        <button 
          class="flex items-center gap-3 py-2 px-3 rounded-lg text-gray-600 text-sm no-underline hover:bg-gray-100 {currentView === 'recent' ? 'bg-blue-50 text-blue-600 font-medium' : ''}"
          on:click={() => switchView('recent')}
        >
          <span class="text-base">🕒</span>
          Recent
        </button>
        <button 
          class="flex items-center gap-3 py-2 px-3 rounded-lg text-gray-600 text-sm no-underline hover:bg-gray-100 {currentView === 'starred' ? 'bg-blue-50 text-blue-600 font-medium' : ''}"
          on:click={() => switchView('starred')}
        >
          <span class="text-base">⭐</span>
          Starred
        </button>
        <button 
          class="flex items-center gap-3 py-2 px-3 rounded-lg text-gray-600 text-sm no-underline hover:bg-gray-100 {currentView === 'trash' ? 'bg-blue-50 text-blue-600 font-medium' : ''}"
          on:click={() => switchView('trash')}
        >
          <span class="text-base">🗑️</span>
          Trash
        </button>
        <!-- Add this temporarily after your nav buttons -->
        <button 
          on:click={() => {
            console.log('🔍 FORCE_DEBUG: All items:', allItems.length);
            console.log('🔍 FORCE_DEBUG: Shared items:', allItems.filter(i => i.shared_with_me));
            currentView = 'shared';
          }}
          class="bg-red-500 text-white p-2 rounded"
        >
          DEBUG: Force Shared View
        </button>
      </nav>

      <div class="mt-auto p-4 bg-gray-50 rounded-lg">
        <h3 class="m-0 mb-3 text-sm font-medium text-gray-700">Storage</h3>
        <div class="w-full h-1 bg-gray-200 rounded-full mb-2">
          <div 
            class="h-full bg-blue-600 rounded-full transition-all duration-300"
            style="width: {(storageUsed / storageTotal) * 100}%"
          ></div>
        </div>
        <p class="text-xs text-gray-600 m-0 mb-3">{storageUsed} GB of {storageTotal} GB used</p>
        <button class="py-1.5 px-3 border border-blue-600 rounded bg-transparent text-blue-600 text-xs cursor-pointer hover:bg-blue-50">
          Get more storage
        </button>
      </div>
    </aside>

    <!-- Main content area - Adjusted for fixed sidebar -->
    <main class="flex-1 p-6 overflow-y-auto ml-64">
      <!-- New Form - Slides down from top -->
      {#if showNewForm}
        <div class="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm animate-slide-down">
          <h3 class="text-lg font-medium mb-4">
            {newItemType === 'folder' ? 'Create New Folder' : 'Upload Files'}
          </h3>
                  
          <!-- Name Input - Only for folders -->
          {#if newItemType === 'folder'}
            <div class="mb-4">
              <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                type="text"
                bind:value={newItemName}
                placeholder="Enter folder name"
                class="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          {/if}
          
          <!-- Location Selection with Integrated Dropdown -->
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">Location</label>
                        
            <!-- Path Display with Dropdown -->
            <div class="p-2 bg-gray-50 rounded border text-sm text-gray-600">
              <div class="flex items-center flex-wrap">
                <span
                  class="cursor-pointer hover:text-blue-600 hover:underline"
                  on:click={() => handlePathClick(null, -1)}
                >
                  /
                </span>
                {#each selectedPath === '/' ? [] : selectedPath.split('/').filter(Boolean) as part, index}
                  <span
                    class="cursor-pointer hover:text-blue-600 hover:underline"
                    on:click={() => handlePathClick(null, index)}
                  >
                    {part}/
                  </span>
                {/each}
                
                <!-- Dropdown for available folders -->
                {#if availableFolders.length > 0}
                  <select
                    class="ml-2 px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    on:change={(e) => {
                      const selectedFolder = availableFolders.find(f => f.id === e.target.value);
                      if (selectedFolder) {
                        selectFolder(selectedFolder.id, selectedFolder.name);
                      }
                      e.target.value = ''; // Reset dropdown
                    }}
                  >
                    <option value="">Select folder...</option>
                    {#each availableFolders as folder}
                      <option value={folder.id}>📁 {folder.name}</option>
                    {/each}
                  </select>
                {:else}
                  <span class="ml-2 text-xs text-gray-400">(no subfolders)</span>
                {/if}
              </div>
            </div>
          </div>


          
          <!-- Action Buttons -->
          <div class="flex gap-2 justify-end">
            <button
              class="px-4 py-2 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              on:click={closeNewForm}
            >
              Cancel
            </button>
            <button
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              on:click={submitNewItem}
            >
              {newItemType === 'folder' ? 'Create Folder' : 'Select Files'}
            </button>
          </div>
        </div>
      {/if}

      <!-- Upload Progress -->
      {#if uploading}
        <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-blue-800">Uploading files...</span>
            <span class="text-sm text-blue-600">{Math.round(uploadProgress)}%</span>
          </div>
          <div class="w-full bg-blue-200 rounded-full h-2">
            <div 
              class="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style="width: {uploadProgress}%"
            ></div>
          </div>
        </div>
      {/if}

      <!-- Quick access - only show on My Drive -->
      {#if currentView === 'my-drive' && recentItems.length > 0}
        <section class="mb-8">
          <h2 class="text-lg font-normal text-gray-700 mb-4">Recent files</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {#each recentItems as item}
              <div class="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer transition-all hover:shadow-md hover:border-blue-600" on:click={() => handleItemClick(item)}>
                <div class="text-2xl">{getFileIcon(item.type)}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-700 truncate">{item.name}</div>
                  <div class="text-xs text-gray-500">{item.modified}</div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}
      
      <!-- Breadcrumb Navigation - UPDATED VERSION -->
      {#if (currentView === 'my-drive' || currentView === 'shared') && breadcrumbs.length > 1}
        <div class="mb-6 flex items-center gap-2 text-sm text-gray-600">
          {#each breadcrumbs as breadcrumb, index}
            {#if index === breadcrumbs.length - 1}
              <!-- Current folder - not clickable -->
              <span class="text-gray-900 font-medium flex items-center gap-1">
                {#if breadcrumb.shared}
                  <span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">shared</span>
                {/if}
                {breadcrumb.name}
              </span>
            {:else}
              <!-- Clickable breadcrumb -->
              <button 
                class="hover:text-blue-600 hover:underline transition-colors flex items-center gap-1"
                on:click={() => navigateToBreadcrumb(breadcrumb)}
              >
                {#if breadcrumb.shared}
                  <span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">shared</span>
                {/if}
                {breadcrumb.name}
              </button>
              <span class="text-gray-400 mx-1">›</span>
            {/if}
          {/each}
        </div>
      {/if}
      <!-- Files section -->
      <section>
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-normal text-gray-700">{currentTitle}</h2>
          <div class="text-sm text-gray-600">{filteredItems.length} items</div>
        </div>

        {#if filteredItems.length > 0}
          <div class="{viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4' : 'flex flex-col gap-2'}">
            {#each filteredItems as item}
              <div class="flex {viewMode === 'grid' ? 'flex-col items-center text-center p-4' : 'flex-row items-center gap-3 p-3'} bg-white rounded-lg border border-gray-200 cursor-pointer transition-all hover:shadow-md hover:border-blue-600 relative group" on:click={() => handleItemClick(item)}>
                <div class="text-{viewMode === 'grid' ? '3xl' : '2xl'} {viewMode === 'grid' ? 'mb-2' : ''}">{getFileIcon(item.type)}</div>
                <div class="flex-1 {viewMode === 'grid' ? 'w-full' : ''} min-w-0">
                  <div class="text-sm font-medium text-gray-700 {viewMode === 'grid' ? 'mb-1' : 'mb-1'} truncate">{item.name}</div>
                  <div class="flex {viewMode === 'grid' ? 'flex-col gap-0.5' : 'gap-2'} text-xs text-gray-500">
                    <span>{item.size}</span>
                    <span>{item.modified}</span>
                  </div>
                </div>
               <div class="relative group">
                <!-- Dropdown Trigger -->
                <button 
                  class="p-1 bg-transparent border-none text-base cursor-pointer rounded hover:bg-gray-100"
                  on:click={(e) => toggleDropdown(item.id, e)}
                >
                  ⋮
                </button>

                <!-- Dropdown Menu -->
                {#if activeDropdown === item.id}
                  <div 
                    class="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px]"
                    on:click|stopPropagation
                  >
                    {#if item.type !== 'folder'}
                      <button 
                        class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                        on:click={(e) => handleDropdownAction('download', item, e)}
                      >
                        📥 Download
                      </button>
                    {/if}
                    <button 
                      class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                      on:click={(e) => handleDropdownAction('rename', item, e)}
                    >
                      ✏️ Rename
                    </button>
                    <button 
                      class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                      on:click={(e) => handleDropdownAction('share', item, e)}
                    >
                      🔗 Share
                    </button>
                    <button 
                      class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 text-red-600"
                      on:click={(e) => handleDropdownAction('delete', item, e)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                {/if}
              </div>

              </div>
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <div class="text-5xl mb-4 opacity-50">📁</div>
            <h3 class="text-xl font-normal text-gray-700 mb-2">No files found</h3>
            <p class="text-sm text-gray-500 m-0">
              {currentView === 'my-drive' ? 'Upload your first file to get started' : `No items in ${currentTitle.toLowerCase()}`}
            </p>
          </div>
        {/if}
        {#if showShareModal && currentShareItem}
          <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" on:click={closeShareModal}>
            <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl transform transition-all" on:click|stopPropagation>
              <!-- Header -->
              <div class="flex items-center justify-between mb-6">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span class="text-xl">{getFileIcon(currentShareItem.type)}</span>
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold text-gray-900">Share "{currentShareItem.name}"</h3>
                    <p class="text-sm text-gray-500">Share this {currentShareItem.type} with others</p>
                  </div>
                </div>
                <button 
                  class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  on:click={closeShareModal}
                >
                  <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <!-- Available Users Helper -->
              {#if data?.availableUsers && data.availableUsers.length > 0}
              <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex items-center gap-2 mb-2">
                  <svg class="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                  </svg>
                  <span class="text-sm font-medium text-blue-800">Quick Share</span>
                </div>
                <p class="text-xs text-blue-700 mb-2">Click to share with existing users:</p>
                <div class="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {#each data.availableUsers as user}
                    <!-- Skip current user -->
                    {#if user.id !== data.user.id}
                      <button 
                        class="px-2 py-1 text-xs bg-white border border-blue-300 rounded hover:bg-blue-100 transition-colors truncate max-w-48"
                        on:click={() => shareEmail = user.email}
                        title={user.email}
                      >
                        {user.name || user.email.split('@')[0]} ({user.email})
                      </button>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}

              <!-- Error/Success Messages -->
              {#if shareError}
                <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
                    </svg>
                    <div class="text-sm text-red-700">
                      <div class="font-medium mb-1">Share Failed</div>
                      <div>{shareError}</div>
                    </div>
                  </div>
                </div>
              {/if}

              {#if shareSuccess}
                <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                    </svg>
                    <span class="text-sm text-green-700 font-medium">{shareSuccess}</span>
                  </div>
                </div>
              {/if}

              <!-- Share Form -->
              <div class="space-y-4">
                <!-- Email Input with Validation -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Email address
                  </label>
                  <div class="relative">
                    <input
                      type="email"
                      bind:value={shareEmail}
                      placeholder="Enter email address (e.g., feras10personal@gmail.com)"
                      class="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pl-10"
                      class:border-red-300={shareError && shareError.includes('email')}
                    />
                    <svg class="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path>
                    </svg>
                  </div>
                  <p class="text-xs text-gray-500 mt-1">
                    The user must be registered to receive shares
                  </p>
                </div>

                <!-- Permission Level -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Permission level
                  </label>
                  <select
                    bind:value={sharePermission}
                    class="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="view">👁️ Can view only</option>
                    <option value="edit">✏️ Can edit and modify</option>
                    <option value="comment">💬 Can comment</option>
                  </select>
                </div>

                <!-- Optional Message -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Message (optional)
                  </label>
                  <textarea
                    bind:value={shareMessage}
                    placeholder="Add a personal message..."
                    rows="3"
                    class="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-none"
                  ></textarea>
                </div>

                <!-- Expiry Date -->
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Access expires (optional)
                  </label>
                  <input
                    type="datetime-local"
                    bind:value={shareExpiry}
                    min={new Date().toISOString().slice(0, 16)}
                    class="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-3 pt-4">
                  <button
                    type="button"
                    class="flex-1 px-4 py-3 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    on:click={closeShareModal}
                    disabled={isSharing}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    on:click={handleShare}
                    disabled={isSharing || !shareEmail.trim()}
                  >
                    {#if isSharing}
                      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sharing...
                    {:else}
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"></path>
                      </svg>
                      Share
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </section>
    </main>
    <!-- Photo Preview Modal - Add this right before the closing div of your main container -->
    {#if showPhotoModal && currentPhoto}
      <div 
        class="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50"
        on:click={closePhotoModal}
        on:mousemove={handleMouseMove}
        on:mouseup={handleMouseUp}
        on:wheel={handleWheel}
      >
        <!-- Header -->
        <div class="fixed top-0 left-0 right-0 z-60 bg-black bg-opacity-75 backdrop-blur-sm p-4">
          <div class="flex items-center justify-between text-white">
            <div class="flex items-center gap-4">
              <button 
                on:click={closePhotoModal}
                class="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                title="Close (Esc)"
              >
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <div>
                <h1 class="text-lg font-semibold truncate max-w-md">{currentPhoto.name}</h1>
                <div class="flex items-center gap-4 text-sm text-gray-300">
                  <span>{formatFileSize(currentPhoto.file?.size || 0)}</span>
                  <span>{currentPhoto.mime_type}</span>
                  <span>{Math.round(imageScale * 100)}%</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- Zoom Controls -->
              <button 
                on:click={zoomOut}
                class="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                title="Zoom out (-)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                </svg>
              </button>
              
              <button 
                on:click={resetZoom}
                class="px-3 py-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors text-sm"
                title="Reset zoom (0)"
              >
                {Math.round(imageScale * 100)}%
              </button>
              
              <button 
                on:click={zoomIn}
                class="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                title="Zoom in (+)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>

              <!-- Download Button -->
              <button 
                on:click={(e) => {
                  e.stopPropagation();
                  downloadFile(currentPhoto);
                }}
                class="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
                title="Download"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Image Container -->
        <div 
          class="w-full h-full flex items-center justify-center overflow-hidden cursor-{imageScale > 1 ? 'grab' : 'default'}"
          class:cursor-grabbing={isDragging}
          on:click|stopPropagation
        >
          {#if photoError}
            <div class="text-center text-white">
              <div class="text-6xl mb-4">❌</div>
              <h2 class="text-2xl font-bold mb-2">Error Loading Image</h2>
              <p class="text-gray-300 mb-4">Failed to load the image</p>
              <button 
                on:click={closePhotoModal}
                class="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          {:else}
            <!-- Loading Spinner -->
            {#if photoLoading}
              <div class="flex flex-col items-center gap-4 text-white">
                <div class="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                <p class="text-lg">Loading image...</p>
              </div>
            {/if}

            <!-- Image -->
            <img
              src={currentPhoto.shared_with_me ? 
                  pb.getFileUrl(currentPhoto, currentPhoto.file) : 
                  pb.getFileUrl(currentPhoto, currentPhoto.file)}
              alt={currentPhoto.name}
              class="max-w-full max-h-full object-contain transition-transform duration-200 select-none"
              style="transform: scale({imageScale}) translate({imageX / imageScale}px, {imageY / imageScale}px);"
              on:load={() => {
                photoLoading = false;
                photoError = false;
              }}
              on:error={() => {
                photoLoading = false;
                photoError = true;
              }}
              on:mousedown={handleMouseDown}
              draggable="false"
            />
          {/if}
        </div>

        <!-- Keyboard Shortcuts Help -->
        <div class="fixed bottom-4 right-4 text-xs text-white opacity-75 pointer-events-none">
          <div class="bg-black bg-opacity-50 rounded-lg p-3 space-y-1">
            <div>Esc: Close</div>
            <div>+/-: Zoom in/out</div>
            <div>0: Reset zoom</div>
            <div>Drag: Pan when zoomed</div>
            <div>Scroll: Zoom</div>
          </div>
        </div>
      </div>
    {/if}
      <div 
        class="fixed inset-0 bg-blue-600 bg-opacity-20 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-200 {dragOver ? 'opacity-100' : 'opacity-0 pointer-events-none'}"
        on:drop={handleDrop}
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
      >
        <div class="bg-white rounded-2xl p-8 shadow-2xl border-2 border-dashed border-blue-400 text-center max-w-md">
          <div class="text-6xl mb-4">📁</div>
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Drop files here</h3>
          <p class="text-gray-600">Release to upload files to {currentTitle}</p>
          <div class="mt-4 text-sm text-gray-500">
            <p>• Any file type supported</p>
            <p>• Multiple files allowed</p>
            <p>• No size restrictions</p>
          </div>
      </div>
    </div>
  </div>
</div>

<!-- New Modal -->
{#if showNewModal}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" on:click={closeNewModal}>
    <div class="bg-white rounded-lg p-6 w-80 max-w-md" on:click|stopPropagation>
      <h3 class="text-lg font-semibold mb-4">Create New</h3>
      <div class="space-y-2">
        <button 
          class="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left"
          on:click={() => openNewForm('folder')}
        >
          <span class="text-xl">📁</span>
          <span>New folder</span>
        </button>
        <button 
          class="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left"
          on:click={() => openNewForm('file')}
        >
          <span class="text-xl">📄</span>
          <span>Upload files</span>
        </button>
      </div>
      <div class="mt-4 flex justify-end">
        <button 
          class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
          on:click={closeNewModal}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Hidden file input -->
<input
  type="file"
  multiple
  bind:this={fileInput}
  on:change={handleFileUpload}
  class="hidden"
  accept="*/*"
/>

<!-- Hidden forms for server actions -->
<form bind:this={createFolderForm} method="POST" action="?/createFolder" style="display: none;" use:enhance></form>
<form bind:this={uploadForm} method="POST" action="?/uploadFile" enctype="multipart/form-data" style="display: none;" use:enhance></form>

<style>
  @keyframes slide-down {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-slide-down {
    animation: slide-down 0.3s ease-out;
  }

  @media (max-width: 768px) {
    aside {
      position: fixed;
      left: -16rem;
      top: 65px;
      height: calc(100vh - 65px);
      z-index: 40;
      transition: left 0.3s ease;
    }
    
    main {
      margin-left: 0;
      width: 100%;
      padding: 1rem;
    }
    
    .relative.max-w-2xl {
      margin: 0 1rem;
    }
  }
</style>