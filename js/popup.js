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
      console.log(`%c${msg}`, "color: yellow; font-style: italic; background-color: blue;padding: 2px");
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
  console.log('on');
}

/**
 * turn off catcher
 */
function catcherOff() {
  console.log('off');
}