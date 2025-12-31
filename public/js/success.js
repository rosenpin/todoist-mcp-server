// Success page functionality

// Copy to clipboard function
function copyToClipboard() {
  const urlInput = document.getElementById('integrationUrl');
  const copyBtn = document.getElementById('copyBtn');
  
  urlInput.select();
  urlInput.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(urlInput.value).then(() => {
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
    copyBtn.classList.add('bg-green-500');
    
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('bg-green-500');
      copyBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
    }, 2000);
  });
}


// Delete account function
function deleteAccount() {
  const userId = window.todoistMcpData?.userId;
  
  if (!userId) {
    alert('User ID not found. Please refresh the page.');
    return;
  }
  
  if (confirm('Are you sure you want to delete your account? This will permanently remove your integration URL and you will need to reconnect to create a new one.')) {
    const deleteBtn = document.getElementById('deleteBtn');
    const originalText = deleteBtn.innerHTML;
    
    deleteBtn.innerHTML = '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="currentColor"><path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/></svg>Deleting...';
    deleteBtn.disabled = true;
    
    fetch('/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert('Account deleted successfully. You will now be redirected to the main page.');
        window.location.href = '/';
      } else {
        alert('Failed to delete account: ' + (data.error || 'Unknown error'));
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Failed to delete account: Network error');
      deleteBtn.innerHTML = originalText;
      deleteBtn.disabled = false;
    });
  }
}

// Make functions available globally
window.copyToClipboard = copyToClipboard;
window.deleteAccount = deleteAccount;