var timerId = null;

/**
 * log posted message
 */
function logPostMessage() {
  const iframeList = Array.from(document.querySelectorAll('iframe'));
  iframeList.forEach(iframe => {
    try {
      if (iframe.contentWindow.__post) {
        return;
      }
      console.log('iframe: ', iframe);
      const postMessage = iframe.contentWindow.postMessage;
      iframe.contentWindow.__post = true;
      iframe.contentWindow.postMessage = function () {
        console.log(...arguments);
        const args = [...arguments];
        postMessage(...args);
        console.log("Message post to: " + document.location.href, +"\ndata:", ...args);
      }
    } catch (error) {
      // console.log(iframe);
      // console.log('error', error);
    }
  })
}
timerId = setInterval(logPostMessage, 800);


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

