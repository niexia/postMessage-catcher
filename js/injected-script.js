let __catcherIframeObserver = null;
const __catcherObserverCallback = __catcherThrottle(__logPostMessage, 300);

function __catcherThrottle(fn, interval) {
  let last = 0;
  let timer = null;
  return function () {
    let now = Date.now();
    let delay = interval - (now - last);
    if (delay <= 0) {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      last = Date.now();
      fn.apply(this, arguments);
    } else {
      if (timer) window.clearTimeout(timer);
      timer = setTimeout(() => {
        last = Date.now();
        fn.apply(this, arguments);
      }, delay)
    }
  }
}

/**
 * log posted message
 */
function __logPostMessage(mutationsList, observer) {
  const iframeList = Array.from(document.querySelectorAll('iframe'));
  
  if (!iframeList.length) {
    return;
  }

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
  if (__catcherIframeObserver) {
    __catcherIframeObserver.disconnect();
    __catcherIframeObserver = null;
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
  __catcherIframeObserver = __catcherCreateIframeObserver(__catcherObserverCallback);
}

function __catcherCreateIframeObserver(callback) {
  const targetNode = document.body;
  const config = {
    attributes: false,
    childList: true,
    subtree: true
  };
  const observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
  return observer;
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