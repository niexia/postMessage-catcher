let __logMessageTimerId;

/**
 * log posted message
 */
function __logPostMessage() {
  const iframeList = Array.from(document.querySelectorAll('iframe'));
  iframeList.forEach(iframe => {
    try {
      const { postMessage, __catchPostMessage } = iframe.contentWindow;
      if (__catchPostMessage) {
        return;
      }
      iframe.contentWindow.__catchPostMessage = postMessage;
      iframe.contentWindow.postMessage = function () {
        postMessage(...arguments);
        console.log(
          "⬆️",
          "\nMessage posted to: " + iframe.src,
          "\ndata: ", ...arguments
        );
      }
    } catch (error) {
      // console.log('Open postMessage catcher error: ', error);
    }
  })
}

function __closeLogPostMessage() {
  if (__logMessageTimerId) {
    clearInterval(__logMessageTimerId);
    __logMessageTimerId = null;
  }
  const iframeList = Array.from(document.querySelectorAll('iframe'));
  iframeList.forEach(iframe => {
    try {
      const { __catchPostMessage } = iframe.contentWindow;
      if (!__catchPostMessage) {
        return;
      }
      iframe.contentWindow.postMessage = __catchPostMessage;
      delete iframe.contentWindow.__catchPostMessage;
    } catch (error) {
      // console.log('Close postMessage catcher error: ', error);
    }
  })
}

function __openLogPostMessage() {
  __logPostMessage();
  __logMessageTimerId = setInterval(__logPostMessage, 500);
}


window.addEventListener("message", function (e) {
  const { type, data } = e.data || {};
  if (type !== 'postMessage-catcher') {
    return;
  }
  if (data.catcher) {
    __openLogPostMessage();
  } else {
    __closeLogPostMessage();
  }
}, false);


__openLogPostMessage();