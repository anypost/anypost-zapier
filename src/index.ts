import type { App, Trigger, Create } from 'zapier-platform-core';
import {
  authentication,
  includeBearerToken,
  handleApiError,
} from './authentication';
import { sendEmail } from './creates/send-email';
import { emailEvent } from './triggers/email-event';
import { templateList } from './triggers/template-list';

const { version } = require('../package.json') as { version: string };
const { version: platformVersion } = require('zapier-platform-core') as {
  version: string;
};

const App: App<Record<string, Trigger>, Record<string, Create>> = {
  version,
  platformVersion,

  // Pass input through to each perform verbatim instead of letting the
  // platform auto-clean it, for predictable request bodies. The send action
  // already drops empty optional fields itself.
  flags: {
    cleanInputData: false,
  },

  authentication,

  // Bearer token on every request; shape API errors on the way back.
  beforeRequest: [includeBearerToken],
  afterResponse: [handleApiError],

  triggers: {
    [emailEvent.key]: emailEvent,
    [templateList.key]: templateList,
  },

  creates: {
    [sendEmail.key]: sendEmail,
  },
};

export default App;
