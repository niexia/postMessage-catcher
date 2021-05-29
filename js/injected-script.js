/**
 * log posted message
 */
function __logPostMessage() {
  const iframeList = Array.from(document.querySelectorAll('iframe'));
  iframeList.forEach(iframe => {
    try {
      if (iframe.contentWindow.__catch) {
        return;
      }
      const postMessage = iframe.contentWindow.postMessage;
      iframe.contentWindow.__catch = true;
      iframe.contentWindow.postMessage = function () {
        console.log(...arguments);
        postMessage(...arguments);
      }
      console.log('catch success!\n', iframe.src)
    } catch (error) {
      // console.log('Catch postMessage error', error);
    }
  })
}

let __logMessageTimerId = setInterval(__logPostMessage, 500);
__logPostMessage();