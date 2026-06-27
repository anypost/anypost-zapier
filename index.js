// Entry point that Zapier's CommonJS Lambda wrapper requires at the bundle
// root (`require('<root>/index.js')`). The integration is written in
// TypeScript and compiled to dist/, so re-export the compiled app definition
// here. Keep this as plain JS — it is not part of the tsc build.
const app = require('./dist/index.js');
module.exports = app.default || app;
