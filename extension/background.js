// Tabora background service worker
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First-time install → open the welcome experience
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/index.html') });
  }
});
