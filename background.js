const DDG_ICON_URL_FILTER = {
  urls: ["https://icons.duckduckgo.com/ip3/*.ico"],
};

const notFoundIconUrls = new Set();

const notify404 = (iconUrl) => {
  chrome.runtime
    .sendMessage({
      type: "ddg-icon-404",
      iconUrl,
    })
    .catch(() => {});
};

chrome.webRequest.onCompleted.addListener((details) => {
  if (details.statusCode !== 404) return;

  notFoundIconUrls.add(details.url);
  notify404(details.url);
}, DDG_ICON_URL_FILTER);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "check-ddg-icon") return;

  sendResponse({
    statusCode: notFoundIconUrls.has(message.iconUrl) ? 404 : null,
  });
});
