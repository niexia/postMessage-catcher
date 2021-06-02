const STATUS_FONT_STYLE = "color: yellow; font-style: italic; background-color: blue;padding: 2px";

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
    }, () => {
      const msg = checked ?
        'The catcher is already on!':
        'The catcher is already off!'
      console.log(`%c${msg}`, STATUS_FONT_STYLE);
    });
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
    if (!enablePostMessageCatcher) {
      catcherOff();
    }
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
  chrome.runtime.sendMessage({
    enablePostMessageCatcher: true
  }, function (response) {
    console.log(response.farewell);
    console.log(`%c$The catcher is already on!`, STATUS_FONT_STYLE);
  });
}

/**
 * turn off catcher
 */
function catcherOff() {
  chrome.runtime.sendMessage({
    enablePostMessageCatcher: false
  }, function (response) {
    console.log(response.farewell);
    console.log(`%c$The catcher is already off!`, STATUS_FONT_STYLE);
  });
}