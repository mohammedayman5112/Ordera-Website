// Forwards API calls from the Angular dev server to the ASP.NET Core API, so the browser sees a single origin.
// The default matches the http profile in OrderApi/Properties/launchSettings.json; override it with API_URL.
const target = process.env.API_URL || 'http://localhost:52195';

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
  },
  // SignalR (live order updates) needs WebSocket proxying as well.
  '/hubs': {
    target,
    secure: false,
    changeOrigin: true,
    ws: true,
  },
};
