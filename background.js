// Clicking the toolbar icon opens the calendar view, or focuses it if it's already open.
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('view.html');
  try {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
      const ctx = contexts.find((c) => c.tabId >= 0);
      if (ctx) {
        const tab = await chrome.tabs.update(ctx.tabId, { active: true });
        if (tab && tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    }
  } catch (e) {
    // fall through and open a new tab
  }
  await chrome.tabs.create({ url });
});
