var __init = false;
const MESSAGE_TYPE = 'postMessage-catcher';

/**
 * Log received message
 * @param {*} event
 */
function logReceivedMessage(event) {
  try {
    const { type } = event.data;
    // filter self message
    if (type === MESSAGE_TYPE) {
      return;
    }
    console.log(
      "⬇️",
      "\nMessage received by: " + document.location.href,
      "\norigin: " + event.origin,
      "\nsource: ", event.source,
      "\ndata: ", event.data
    );
  } catch (error) {
    // If the source window is cross-origin, you can't log it here
    console.log(
      "Message received by: " + document.location.href, 
      "\norigin: " + event.origin + " source is cross-origin", 
      "\ndata: ", event.data
    );
  }
}

/**
 * Inject a script to log postMessage
 */
function injectToLogPostMessage() {
  let $script = document.createElement('script');
  $script.setAttribute('type', 'text/javascript');
  $script.src = chrome.runtime.getURL('js/injected-script.js');
  $script.onload = function () {
    this.parentNode.removeChild(this);
  }
  try {
    document.head.appendChild($script);
  } catch (error) {
    console.log('error: ', error);
  }
}


/**
 * Init Catcher
 */
function initCatcher() {
  chrome.storage.sync.get(['enablePostMessageCatcher'], function (result) {
    const { enablePostMessageCatcher } = result;
    if (enablePostMessageCatcher) {
      window.addEventListener("message", logReceivedMessage)
      injectToLogPostMessage();
      __init = true;
      console.log('🔥 A postMessage catcher is Going!')
    }
  });
}

/**
 * Open cather
 * add a message listener, and use setInterval function to repeatedly
 * call a function to change the original postMessage method of iframe.
 */
function openCather() {
  if (!__init) {
    initCatcher();
    return;
  }
  window.addEventListener("message", logReceivedMessage);
  window.postMessage({
    type: MESSAGE_TYPE,
    data: {
      catcher: true
    }
  }, '*');
  console.log('🔥 The postMessage catcher is opened!')
}

/**
 * Close catcher
 * remove the message listener, and send a message to inject-script
 * to clear timer.
 */
function closeCatcher() {
  window.removeEventListener("message", logReceivedMessage);
  window.postMessage({
    type: MESSAGE_TYPE,
    data: {
      catcher: false
    }
  }, '*');
  console.log('🚫 The postMessage catcher is closed!')
}

/**
 * Set up an runtime message event listener
 */
chrome.runtime.onMessage.addListener(
  function (request = {}, sender, sendResponse) {
    const { catcher } = request;
    let msg = '';
    switch (catcher) {
      case 'on': 
        openCather();
        msg = 'open success!'
        break;
      case 'off':
        closeCatcher();
        msg = 'close success!'
        break;
      default:
        msg = 'warning!'
        break;
    };
    sendResponse({ msg });
  }
);

openCather();