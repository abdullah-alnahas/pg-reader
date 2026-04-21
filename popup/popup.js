const STORAGE_KEY = 'pg-reader-enabled';
const toggle = document.getElementById('toggle');

chrome.storage.sync.get([STORAGE_KEY], (result) => {
    toggle.checked = result[STORAGE_KEY] !== false;
});

toggle.addEventListener('change', () => {
    chrome.storage.sync.set({ [STORAGE_KEY]: toggle.checked }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' }, () => {
                    void chrome.runtime.lastError;
                });
            }
        });
    });
});