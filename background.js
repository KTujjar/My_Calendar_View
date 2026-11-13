const VIEW_URL = () => chrome.runtime.getURL('view.html');

// Open the calendar view, or focus it if it's already open.
async function openView() {
  const url = VIEW_URL();
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
}

chrome.action.onClicked.addListener(openView);

// Pomodoro: notify when a session ends, even if no calendar tab is open.
const POMO_TEXT = {
  focus: { title: 'Focus session complete 🍅', short: 'Time for a short break.', long: 'Time for a long break — nice work!' },
  short: { title: 'Break over', focus: 'Ready to focus?' },
  long: { title: 'Long break over', focus: 'Ready to focus?' },
};

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'pomodoro') return;
  const { pomoAlarmInfo: info } = await chrome.storage.local.get('pomoAlarmInfo');
  const t = POMO_TEXT[(info && info.mode) || 'focus'] || POMO_TEXT.focus;
  const message = (info && t[info.nextMode]) || 'Timer finished.';
  chrome.notifications.create('pomodoro', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: t.title,
    message,
    priority: 2,
    requireInteraction: true,
  });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id !== 'pomodoro') return;
  chrome.notifications.clear(id);
  openView();
});
