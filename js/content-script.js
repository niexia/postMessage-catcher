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
addEventListener("message", logReceivedMessage)

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
injectToLogPostMessage();

/**
 * set up an runtime message event listener
 */
chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    console.log(sender.tab ?
      "from a content script:" + sender.tab.url :
      "from the extension");
    if (request.enablePostMessageCatcher == "hello")
      sendResponse({
        farewell: "goodbye"
      });
  }
);