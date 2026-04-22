const STORAGE_KEY = 'pg-reader-enabled';
const btn = document.getElementById('toggle');
const statusText = document.getElementById('status-text');

function render(enabled) {
    btn.setAttribute('aria-pressed', String(enabled));
    btn.setAttribute('aria-label', enabled ? 'Disable reader mode' : 'Enable reader mode');
    statusText.textContent = enabled ? 'Reader on' : 'Reader off';
}

chrome.storage.sync.get([STORAGE_KEY], (result) => {
    render(result[STORAGE_KEY] !== false);
});

btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    render(next);
    chrome.storage.sync.set({ [STORAGE_KEY]: next }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle' }, () => {
                    void chrome.runtime.lastError;
                });
            }
        });
    });
});
