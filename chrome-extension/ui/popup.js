// chrome-extension/ui/popup.js
// Production-grade popup UI controller

class PopupController {
  constructor() {
    this.state = {
      connected: false,
      currentTask: null,
      currentPage: null
    };
    this.init();
  }

  async init() {
    console.log('[Popup] Initializing...');
    
    // Load current state from background
    await this.loadState();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Update UI
    this.updateUI();
    
    // Start polling for updates
    this.startPolling();
  }

  async loadState() {
    try {
      // Get state from background script
      const response = await chrome.runtime.sendMessage({ type: 'get_state' });
      
      if (response) {
        this.state = response;
      }
      
      // Get current tab info
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        this.state.currentPage = this.formatUrl(tab.url);
      }
    } catch (error) {
      console.error('[Popup] Failed to load state:', error);
    }
  }

  setupEventListeners() {
    // Open chat button
    document.getElementById('openChatBtn').addEventListener('click', () => {
      this.openChat();
    });
    
    // Reconnect button
    document.getElementById('reconnectBtn').addEventListener('click', () => {
      this.reconnect();
    });
    
    // Pause button
    document.getElementById('pauseBtn').addEventListener('click', () => {
      this.togglePause();
    });
    
    // Settings link
    document.getElementById('settingsLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.openSettings();
    });
    
    // Help link
    document.getElementById('helpLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.openHelp();
    });
  }

  updateUI() {
    // Update connection status
    const connectionStatus = document.getElementById('connectionStatus');
    const indicator = connectionStatus.querySelector('.status-indicator');
    
    if (this.state.connected) {
      connectionStatus.classList.remove('disconnected');
      connectionStatus.classList.add('connected');
      indicator.classList.remove('disconnected');
      indicator.classList.add('connected');
      connectionStatus.innerHTML = '<span class="status-indicator connected"></span>Connected';
      
      // Enable buttons
      document.getElementById('reconnectBtn').disabled = true;
      document.getElementById('pauseBtn').disabled = false;
    } else {
      connectionStatus.classList.remove('connected');
      connectionStatus.classList.add('disconnected');
      indicator.classList.remove('connected');
      indicator.classList.add('disconnected');
      connectionStatus.innerHTML = '<span class="status-indicator disconnected"></span>Disconnected';
      
      // Disable buttons
      document.getElementById('reconnectBtn').disabled = false;
      document.getElementById('pauseBtn').disabled = true;
    }
    
    // Update current page
    document.getElementById('currentPage').textContent = this.state.currentPage || 'Unknown';
    
    // Update task info
    if (this.state.currentTask) {
      const taskDiv = document.getElementById('currentTask');
      taskDiv.classList.remove('hidden');
      
      document.getElementById('taskName').textContent = this.state.currentTask.name;
      
      const completed = this.state.currentTask.completedSteps || 0;
      const total = this.state.currentTask.totalSteps || 0;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      document.getElementById('taskProgress').textContent = `${completed}/${total} steps complete`;
      document.getElementById('progressFill').style.width = `${progress}%`;
    } else {
      document.getElementById('currentTask').classList.add('hidden');
    }
  }

  startPolling() {
    // Poll for updates every 2 seconds
    setInterval(async () => {
      await this.loadState();
      this.updateUI();
    }, 2000);
  }

  openChat() {
    // Open chat in new window
    chrome.windows.create({
      url: 'http://localhost:3000/chat',
      type: 'popup',
      width: 1000,
      height: 700
    });
  }

  async reconnect() {
    try {
      await chrome.runtime.sendMessage({ type: 'reconnect' });
      await this.loadState();
      this.updateUI();
    } catch (error) {
      console.error('[Popup] Reconnect failed:', error);
    }
  }

  async togglePause() {
    try {
      const action = this.state.paused ? 'resume' : 'pause';
      await chrome.runtime.sendMessage({ type: action });
      this.state.paused = !this.state.paused;
      
      const pauseBtn = document.getElementById('pauseBtn');
      pauseBtn.innerHTML = this.state.paused 
        ? '<span>▶️</span>Resume Automation'
        : '<span>⏸️</span>Pause Automation';
    } catch (error) {
      console.error('[Popup] Toggle pause failed:', error);
    }
  }

  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  openHelp() {
    chrome.tabs.create({
      url: 'https://Pushpa.ai/help/browser-extension'
    });
  }

  formatUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
