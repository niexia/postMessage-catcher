var __init = false;
/**
 * log received message
 * @param {*} event
 */
function logReceivedMessage(event) {
  try {
    console.log("Message received by: " + document.location.href, "\norigin: " + event.origin + " source: ", event.source, "\ndata:", event.data)
  } catch (error) {
    // If the source window is cross-origin, you can't log it here
    console.log("Message received by: " + document.location.href, "\norigin: " + event.origin + " source is cross-origin", "\ndata:", event.data)
  }
}
// window.addEventListener("message", logReceivedMessage)

/**
 * inject a script to log postMessage
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
// injectToLogPostMessage();


/**
 * init Catcher
 */
function initCatcher() {
  chrome.storage.sync.get(['enablePostMessageCatcher'], function (result) {
    const { enablePostMessageCatcher } = result;
    if (enablePostMessageCatcher) {
      window.addEventListener("message", logReceivedMessage)
      injectToLogPostMessage();
      __init = true;
    }
  });
}

function openCather() {
  window.addEventListener("message", logReceivedMessage);
}

function closeCatcher() {
  window.removeEventListener("message", logReceivedMessage);
}

/**
 * set up an runtime message event listener
 */
chrome.runtime.onMessage.addListener(
  function (request = {}, sender, sendResponse) {
    console.log(request);
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