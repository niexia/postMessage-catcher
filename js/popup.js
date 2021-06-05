const STATUS_FONT_STYLE = "color: yellow; font-style: italic; background-color: blue;padding: 2px";
const STORE_FONT_STYLE = "font-style: italic; padding: 2px";

function Switch(options) {
  this.el = options.el;
  this.defaultStatus = options.checked;
  this.onChange = function () {
    const { checked } = this;
    // set status
    if (checked) {
      catcherOn();
    } else {
      catcherOff();
    }

    // set store
    chrome.storage.sync.set({
      'enablePostMessageCatcher': checked
    }, () => {});
  }
}
const catcherSwitch = new Switch({
  el: document.querySelector('.nx-switch__input'),
  checked: true
});

/**
 * init
 */
chrome.storage.sync.get(['enablePostMessageCatcher'], function (result) {
  const { enablePostMessageCatcher } = result;
  if (typeof enablePostMessageCatcher == 'undefined') {
    // It's on by default
    chrome.storage.sync.set({
      'enablePostMessageCatcher': catcherSwitch.defaultStatus
    }, () => {
      catcherSwitch.el.checked = catcherSwitch.defaultStatus;
    })
  } else {
    catcherSwitch.el.checked = enablePostMessageCatcher;
  }
});

/**
 * add a listener to switch
 */
catcherSwitch.el.addEventListener('change', catcherSwitch.onChange);

/**
 * turn on catcher
 */
function catcherOn() {
  sendMessageToContentScript({
    catcher: 'on'
  }, function (response = {}) {
    const { msg } = response;
    console.log(`%c${msg}`, STATUS_FONT_STYLE);
  });
}

/**
 * turn off catcher
 */
function catcherOff() {
  sendMessageToContentScript({
    catcher: 'off'
  }, function (response = {}) {
    const { msg } = response;
    console.log(`%c${msg}`, STATUS_FONT_STYLE);
  });
}

function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({
    currentWindow: true
  }, function (tabs) {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(
        tab.id,
        message,
        function handler (response) {
          if (callback) {
            callback(response);
          }
        }
      );
    })
  });
}