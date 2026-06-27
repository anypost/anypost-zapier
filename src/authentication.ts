import type {
  Authentication,
  BeforeRequestMiddleware,
  AfterResponseMiddleware,
  ZObject,
  Bundle,
} from 'zapier-platform-core';

// Production API. All requests are made against the versioned base.
export const API_BASE = 'https://api.anypost.com/v1';

// Shape of GET /v1/whoami: the cheapest authenticated call, and the only
// management endpoint reachable by a `send_only` key, so it doubles as the
// connection test for keys of either permission level.
interface Whoami {
  team: { id: string; name: string } | null;
  api_key: { id: string; permissions: 'full' | 'send_only' };
}

// Connection test: a 200 from /whoami means the key is valid. Returning the
// body lets `connectionLabel` render the team name on the stored connection.
const test = async (z: ZObject, _bundle: Bundle): Promise<Whoami> => {
  const response = await z.request({ url: `${API_BASE}/whoami` });
  return response.data as Whoami;
};

export const authentication: Authentication = {
  type: 'custom',
  test,
  // Rendered from the /whoami test response. Falls back to the key id when a
  // team can't be resolved (e.g. an orphaned key).
  connectionLabel: '{{team.name}}',
  fields: [
    {
      key: 'api_key',
      label: 'API Key',
      type: 'string',
      required: true,
      helpText:
        'Your Anypost API key (begins with `ap_`). Create one in the Anypost ' +
        'dashboard under Settings, then API Keys. A `send_only` key can send ' +
        'email; the **New Email Event** trigger needs a `full` key because it ' +
        'creates a webhook subscription. See the ' +
        '[API keys documentation](https://anypost.com/docs/reference/api-keys).',
    },
  ],
};

// Attach the bearer token to every outbound request. Anypost authenticates
// with `Authorization: Bearer ap_xxx`.
export const includeBearerToken: BeforeRequestMiddleware = (request, _z, bundle) => {
  const apiKey = bundle.authData?.api_key;
  if (apiKey) {
    request.headers = request.headers ?? {};
    request.headers.Authorization = `Bearer ${apiKey}`;
  }
  return request;
};

// Turn Anypost error responses into Zapier-friendly errors. A 401 trips
// Zapier's re-auth flow; everything else surfaces the API's error message.
export const handleApiError: AfterResponseMiddleware = (response, z) => {
  if (response.status === 401) {
    throw new z.errors.RefreshAuthError(
      'Your Anypost API key was rejected. Please reconnect your account.',
    );
  }
  if (response.status >= 400) {
    const data = response.data as { error?: { message?: string }; message?: string } | undefined;
    const detail = data?.error?.message ?? data?.message ?? response.content;
    throw new z.errors.Error(
      `Anypost API error (HTTP ${response.status}): ${detail}`,
      'AnypostApiError',
      response.status,
    );
  }
  return response;
};
